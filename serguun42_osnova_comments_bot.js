import Telegraf from 'telegraf';
import COMMANDS from './config/commands.js';
import BuildImages from './core/build-images.js';
import CheckMessagesForLinks from './core/check-messages-for-links.js';
import GetComments from './core/get-comments.js';
import ReplyWithImages from './core/reply-with-images.js';
import CreateSecondSourceServer from './core/create-second-source-server.js';
import LoadConfig from './util/load-config.js';
import LogMessageOrError from './util/log.js';
import CommentsError from './util/errors/comment-error.js';
import CheckForCommandAvailability from './util/check-for-command-availability.js';

const IS_DEV = process.env.NODE_ENV === 'development';

const { TELEGRAM_BOT_TOKEN, CHATS_LIST, LOCAL_SERVER_PORT, LOCAL_HTTP_BYPASS_SERVER_PORT } = LoadConfig();

const telegraf = new Telegraf.Telegraf(
  TELEGRAM_BOT_TOKEN,
  IS_DEV
    ? {}
    : LOCAL_SERVER_PORT
    ? {
        telegram: {
          apiRoot: `http://127.0.0.1:${LOCAL_SERVER_PORT}`,
        },
      }
    : {}
);
const { telegram } = telegraf;

const botStartedTime = Date.now();
telegraf.on('text', (ctx) => {
  if (!IS_DEV && Date.now() - botStartedTime < 15e3) return;

  const { chat, from } = ctx;
  if (!chat) return;

  const { message } = ctx;
  if (!message) return;

  const { text } = message;
  if (!text) return;

  const commandMatch = text.match(
    chat.type === 'private' ? /^\/(?<commandName>[\w]+)/i : /^\/(?<commandName>[\w]+)@serguun42_osnova_comments_bot$/i
  );
  const commandName = commandMatch?.groups?.commandName || '';
  const commandAction = COMMANDS[commandName] || null;

  if (chat.type === 'private')
    LogMessageOrError(
      `Private chat – ${from.first_name} ${from.last_name || ''} (lang: ${from.language_code}) (${
        from.username ? `@${from.username}` : `id: ${from.id}`
      }) – text: ${message.text}`
    );

  const knownChat = CHATS_LIST.find((chatFromConfig) => chatFromConfig.id === chat.id);
  if (chat.type !== 'private') {
    if (!knownChat) {
      LogMessageOrError('New group', chat.id, chat.title, chat.type);
      return;
    }

    if (!knownChat.enabled) return;
  }

  if (commandAction) {
    if (!CheckForCommandAvailability(from)) return;

    if (typeof commandAction === 'string') {
      ctx
        .reply(commandAction, {
          disable_web_page_preview: true,
          parse_mode: 'HTML',
        })
        .catch(LogMessageOrError);
      return;
    }

    if (typeof commandAction === 'function') {
      commandAction(ctx);
      return;
    }
  }

  if (chat.type !== 'private' || IS_DEV)
    CheckMessagesForLinks(message)
      .then((commentsFromMessage) => GetComments(commentsFromMessage))
      .then((commentToBuild) => BuildImages(commentToBuild.filter(Boolean)))
      .then((buildComments) => ReplyWithImages(ctx, buildComments, knownChat?.fullsize))
      .catch((e) => {
        if (e instanceof CommentsError) return;

        LogMessageOrError(e);
      });
});
telegraf.launch();

if (LOCAL_HTTP_BYPASS_SERVER_PORT) CreateSecondSourceServer(telegram);

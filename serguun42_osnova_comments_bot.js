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
import CheckCommandAvailability from './util/check-command-availability.js';
import IS_DEV from './util/is-dev.js';
import SendingWrapper from './util/sending-wrapper.js';

const { TELEGRAM_BOT_TOKEN, BOT_USERNAME, CHATS_LIST, LOCAL_SERVER_PORT, LOCAL_HTTP_BYPASS_SERVER_PORT } = LoadConfig();

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
telegraf.on('message', (ctx) => {
  if (!IS_DEV && Date.now() - botStartedTime < 15e3) return;

  const { chat, from, message } = ctx;
  if (!chat || !message) return;

  if (!('text' in message)) return;
  const { text } = message;

  const knownChat = CHATS_LIST.find((chatFromConfig) => chatFromConfig.id === chat.id);
  if (chat.type === 'private') {
    LogMessageOrError(
      `Private chat – ${from.first_name} ${from.last_name || ''} (lang: ${from.language_code}) (${
        from.username ? `@${from.username}` : `id: ${from.id}`
      }) – text: ${text}`
    );
  } else {
    if (!knownChat) {
      LogMessageOrError(`New group. ID: ${chat.id}, title: ${chat.title}, type: ${chat.type}`);
      return;
    }

    if (!knownChat.enabled) return;
  }

  if (!text) return;

  const commandMatch = text.match(
    new RegExp(`^/(?<commandName>\\w+)(?:@${BOT_USERNAME})${chat.type === 'private' ? '?' : ''}\\b`, 'i')
  );
  const commandName = commandMatch?.groups?.commandName || '';
  const commandAction = COMMANDS[commandName];

  if (commandAction) {
    if (!CheckCommandAvailability(from, commandName)) return;

    if (typeof commandAction === 'string') {
      SendingWrapper(() =>
        ctx.sendMessage(commandAction, {
          disable_web_page_preview: true,
          parse_mode: 'HTML',
        })
      ).catch(LogMessageOrError);
      return;
    }

    if (chat.type === 'private') return;

    if (typeof commandAction === 'function') {
      commandAction(ctx);
      return;
    }
  }

  if (chat.type !== 'private' || IS_DEV)
    CheckMessagesForLinks(message)
      .then((commentsFromMessage) => GetComments(commentsFromMessage.filter(Boolean)))
      .then((commentToBuild) => BuildImages(commentToBuild.filter(Boolean)))
      .then((buildComments) => ReplyWithImages(ctx, buildComments, knownChat?.fullsize))
      .catch((e) => {
        if (e instanceof CommentsError) return;

        LogMessageOrError(e);
      });
});
telegraf.launch();

process.on('unhandledRejection', (reason, promise) =>
  LogMessageOrError('Unhandled Rejection at: Promise', promise, 'reason:', reason)
);
process.once('SIGINT', () => telegraf.stop('SIGINT'));
process.once('SIGTERM', () => telegraf.stop('SIGTERM'));

if (LOCAL_HTTP_BYPASS_SERVER_PORT) CreateSecondSourceServer(telegram);

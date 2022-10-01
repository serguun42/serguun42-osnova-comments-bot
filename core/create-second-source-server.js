import http from 'node:http';
import CommentsError from '../util/errors/comment-error.js';
import LoadConfig from '../util/load-config.js';
import LogMessageOrError from '../util/log.js';
import SafeURL from '../util/safe-url.js';
import TGE from '../util/tge.js';
import { UNIX_TIME_CONVERSION_RATE } from '../util/time.js';
import BuildImages from './build-images.js';

const { CHATS_LIST, LOCAL_HTTP_BYPASS_SERVER_PORT } = LoadConfig();

/**
 * @param {import("http").IncomingMessage} req
 * @param {"text" | "json"} [type="text"]
 * @returns {Promise<string>}
 */
const ReadPost = (req, type = 'text') =>
  new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));

    req.on('error', (e) => reject(e));

    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  }).then((readPostBody) => {
    if (type !== 'json' && type !== 'text') type = 'text';

    if (type === 'json')
      return new Promise((resolve, reject) => {
        try {
          const parsedJSON = JSON.parse(readPostBody);
          resolve(parsedJSON);
        } catch (e) {
          reject(e);
        }
      });

    return Promise.resolve(readPostBody);
  });

/**
 *
 * @param {import("telegraf").Telegram} telegram
 */
const CreateSecondSourceServer = (telegram) => {
  const specialChatID = CHATS_LIST.find((chat) => chat.special)?.id;

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  const handle = (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('405 Method Not Allowed');
      return;
    }

    if (!specialChatID) {
      res.statusCode = 404;
      res.end('404 Not Found');
      return;
    }

    ReadPost(req, 'json')
      .then(
        /** @param {Partial<import('../types/comment-to-build').CommentToBuild>} commentFromHook */ (
          commentFromHook
          // eslint-disable-next-line consistent-return
        ) => {
          if (!commentFromHook) return Promise.reject(new CommentsError(CommentsError.PARTIAL_DATA));

          if (
            !commentFromHook.link ||
            !commentFromHook.postID ||
            !commentFromHook.id ||
            !commentFromHook.author?.id ||
            !commentFromHook.author?.avatar_url ||
            !commentFromHook.author?.name
          )
            return Promise.reject(new CommentsError(CommentsError.PARTIAL_DATA));

          res.statusCode = 200;
          res.end('200 OK');

          if (!commentFromHook.date) commentFromHook.date = Math.round(Date.now() / UNIX_TIME_CONVERSION_RATE);
          if (!commentFromHook.likes) commentFromHook.likes = { count: 0, summ: 0 };

          const captionForSpecialMessage = `${
            commentFromHook.author?.id
              ? `<a href="${encodeURI(
                  new URL(`/u/${commentFromHook.author?.id}`, SafeURL(commentFromHook.link).origin).href
                )}">${TGE(commentFromHook.author?.name)}</a>`
              : `<b>${TGE(commentFromHook.author?.name)}</b>`
          }\n\n${commentFromHook.text?.length ? `<i>${TGE(commentFromHook.text)}</i>\n\n` : ''}<a href="${encodeURI(
            commentFromHook.link
          )}">${TGE(commentFromHook.link)}</a>`;

          BuildImages([commentFromHook])
            .then(([{ buffer }]) => {
              telegram
                .sendPhoto(
                  specialChatID,
                  {
                    source: buffer,
                    filename: `comment_halfsize_${commentFromHook.id}.jpeg`,
                  },
                  {
                    caption: captionForSpecialMessage,
                    disable_web_page_preview: true,
                    parse_mode: 'HTML',
                  }
                )
                .catch((e) => {
                  LogMessageOrError(e);

                  telegram.sendMessage(specialChatID, captionForSpecialMessage).catch(LogMessageOrError);
                })
                .finally(() => {
                  telegram
                    .sendDocument(
                      specialChatID,
                      {
                        source: buffer,
                        filename: `comment_full_${commentFromHook.id}.jpeg`,
                      },
                      {
                        disable_web_page_preview: true,
                      }
                    )
                    .catch(LogMessageOrError);
                });
            })
            .catch(LogMessageOrError);
        }
      )
      .catch((e) => {
        LogMessageOrError(e);

        try {
          if (e instanceof CommentsError && e.code === CommentsError.PARTIAL_DATA) {
            res.statusCode = 406;
            res.end('406 Not Acceptable');
          } else {
            res.statusCode = 500;
            res.end('500 Internal Server Error');
          }
          // eslint-disable-next-line no-empty
        } catch (_) {}
      });
  };

  http.createServer(handle).listen(LOCAL_HTTP_BYPASS_SERVER_PORT);
};

export default CreateSecondSourceServer;

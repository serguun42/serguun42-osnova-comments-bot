import fs from 'node:fs/promises';
import path from 'node:path';
import LoadConfig from '../util/load-config.js';
import LogMessageOrError from '../util/log.js';
import SendingWrapper from '../util/sending-wrapper.js';
import TGE from '../util/tge.js';

const { DUMPING_FOLDER } = LoadConfig();

/**
 * @param {import("telegraf").Context} ctx
 * @param {import('../types/built-comment').BuiltComment[]} builtComments
 * @param {boolean} [fullsize]
 */
const ReplyWithImages = (ctx, builtComments, fullsize = false) => {
  builtComments.filter(Boolean).forEach((buildComment) => {
    if (DUMPING_FOLDER)
      fs.writeFile(
        path.join(DUMPING_FOLDER, `comment_${buildComment.commentID}_(${Date.now()}).png`),
        buildComment.buffer
      ).catch(LogMessageOrError);

    SendingWrapper(() =>
      ctx.replyWithPhoto(
        {
          source: buildComment.buffer,
          filename: `comment_halfsize_${buildComment.commentID}.jpeg`,
        },
        {
          caption: `<a href="${encodeURI(buildComment.link)}">${TGE(buildComment.link)}</a>`,
          disable_web_page_preview: true,
          parse_mode: 'HTML',
          reply_to_message_id: ctx.message.message_id,
          allow_sending_without_reply: true,
        }
      )
    )
      .catch(LogMessageOrError)
      .finally(() => {
        if (fullsize) {
          SendingWrapper(() =>
            ctx.replyWithDocument(
              {
                source: buildComment.buffer,
                filename: `comment_full_${buildComment.commentID}.jpeg`,
              },
              {
                disable_web_page_preview: true,
                reply_to_message_id: ctx.message.message_id,
                allow_sending_without_reply: true,
              }
            )
          ).catch(LogMessageOrError);
        }
      });
  });
};

export default ReplyWithImages;

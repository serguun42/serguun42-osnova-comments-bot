import CommentsError from '../util/errors/comment-error.js';
import LoadConfig from '../util/load-config.js';
import SafeURL from '../util/safe-url.js';

const { CDN_DOMAIN } = LoadConfig();

/**
 * @param {import('../types/message').DefaultMessage} message
 * @returns {Promise<import('../types/comment-from-message').CommentFromMessage[]>>}
 */
const CheckMessagesForLinks = (message) => {
  if (!message.entities?.length) return Promise.reject(new CommentsError(CommentsError.NO_URLS_IN_MESSAGE));

  /** @type {import('../types/comment-from-message').CommentFromMessage[]} */
  const commentsFromMessage = [];

  message.entities.forEach((entity) => {
    let urlFromEntity = '';

    if (entity.type === 'url') {
      urlFromEntity = message.text.slice(entity.offset, entity.offset + entity.length);
    } else if (entity.type === 'text_link') {
      urlFromEntity = entity.url;
    } else return;

    try {
      const parsedURL = SafeURL(urlFromEntity);
      const { host, pathname, searchParams } = parsedURL;
      const commentID = parseInt(searchParams.get('comment'));
      const hideReply = searchParams.has('h');

      if (parseInt(commentID) && pathname && host !== CDN_DOMAIN) {
        const splitted = pathname.split('/').filter(Boolean);
        let entryID = 0;

        if (parseInt(splitted[0])) entryID = parseInt(splitted[0]);

        if (splitted[0] === 'u' || splitted[0] === 's') {
          if (parseInt(splitted[2])) entryID = parseInt(splitted[2]);
        } else if (parseInt(splitted[1])) entryID = parseInt(splitted[1]);

        if (entryID) commentsFromMessage.push({ host, entryID, commentID, hideReply });
      }
      // eslint-disable-next-line no-empty
    } catch (_) {}
  });

  const commentsFromMessageFiltered = commentsFromMessage.filter((comment, index) => {
    if (!comment.entryID || !comment.commentID) return false;

    return commentsFromMessage.findIndex((matching) => matching.commentID === comment.commentID) === index;
  });

  if (commentsFromMessageFiltered.length) return Promise.resolve(commentsFromMessageFiltered);
  return Promise.reject(new CommentsError(CommentsError.NO_COMMENTS_IN_MESSAGE));
};

export default CheckMessagesForLinks;

import fetch from 'node-fetch';
import APIError from '../util/errors/api-error.js';
import LoadConfig from '../util/load-config.js';
import LogMessageOrError from '../util/log.js';
import SafeURL from '../util/safe-url.js';

const { CMTT_PLATFORMS } = LoadConfig();

/**
 * @param {import('../types/comment-from-message').CommentFromMessage[]} commentsFromMessage
 * @returns {Promise<import('../types/comment-to-build').CommentToBuild[]>}
 */
const GetComments = (commentsFromMessage) => {
  const commentsUniqueByEntryId = commentsFromMessage.filter((comment, index, array) => {
    return (
      array.findIndex((matching) => matching.host === comment.host && matching.entryID === comment.entryID) === index
    );
  });

  return Promise.all(
    commentsUniqueByEntryId.map((commentUniqueByEntryId) => {
      const platform = CMTT_PLATFORMS[commentUniqueByEntryId.host];
      if (!platform) return Promise.resolve(null);

      const methodUrl = `${platform.apiURL}entry/${commentUniqueByEntryId.entryID}/comments/popular`;
      return fetch(methodUrl, {
        headers: {
          'X-Device-Token': platform.token,
          'User-agent': platform.userAgent,
        },
        method: 'GET',
      })
        .then((res) => {
          if (res.ok) return res.json();

          return Promise.reject(new APIError(methodUrl, res));
        })
        .then((data) =>
          Promise.resolve({
            ...commentUniqueByEntryId,
            /** @type {import('../types/comment-from-api.js').CommentFromAPI[]} */
            commentsFromAPI: data?.result || [],
          })
        )
        .catch((e) => {
          LogMessageOrError(e);
          return Promise.resolve(null);
        });
    })
  ).then((gotEntries) =>
    Promise.all(
      commentsFromMessage.map((commentFromMessage) => {
        const correspondingEntry = gotEntries.find((gotEntry) => gotEntry?.entryID === commentFromMessage.entryID);
        if (!correspondingEntry) return Promise.resolve(null);

        const { commentsFromAPI } = correspondingEntry;
        if (!commentsFromAPI) return Promise.resolve(null);

        const commentFromAPI = commentsFromAPI.find(
          (matchingFromAPI) => matchingFromAPI.id === commentFromMessage.commentID
        );
        if (!commentFromAPI) return Promise.resolve(null);

        /** @type {import('../types/comment-to-build').CommentToBuild} */
        const commentToBuild = {
          ...commentFromAPI,
          allComments: commentsFromAPI,
          link: SafeURL(
            `https://${commentFromMessage.host}/${commentFromMessage.entryID}?comment=${commentFromMessage.commentID}`
          ),
          postID: commentFromMessage.entryID,
        };

        return Promise.resolve(commentToBuild);
      })
    )
  );
};

export default GetComments;

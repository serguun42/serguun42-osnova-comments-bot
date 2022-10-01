class CommentsError extends Error {
  static NO_URLS_IN_MESSAGE = 'No URLs in message';

  static NO_COMMENTS_IN_MESSAGE = 'No comments with IDs in message';

  static PARTIAL_DATA = 'Partial data – lacking essentials';

  /**
   * @param {string} code
   */
  constructor(code) {
    super(`CommentsError: ${code}`);

    this.code = code;
  }
}

export default CommentsError;

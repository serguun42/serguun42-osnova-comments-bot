class APIError extends Error {
  /**
   * @param {string} url
   * @param {import('node-fetch').Response} response
   */
  constructor(url, response) {
    super(`APIError: Response on ${url} – Status ${response.status} ${response.statusText}`);
  }
}

export default APIError;

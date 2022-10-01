/**
 * Escape string for Telegram
 * @param {string} escaping
 * @returns {string}
 */
const TGE = (escaping) => {
  if (!escaping) return '';

  if (typeof escaping === 'string') return escaping.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return TGE(escaping.toString());
};

export default TGE;

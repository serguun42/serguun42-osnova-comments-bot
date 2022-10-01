/**
 * @param {string} emoji
 * @returns {number}
 */
const EmojiToUnicode = (emoji) => {
  let comp = -1;

  if (emoji.length === 1) return emoji.charCodeAt(0).toString(16);

  comp = (emoji.charCodeAt(0) - 0xd800) * 0x400 + (emoji.charCodeAt(1) - 0xdc00) + 0x10000;

  if (comp < 0) comp = emoji.charCodeAt(0);

  return comp.toString(16);
};

export default EmojiToUnicode;

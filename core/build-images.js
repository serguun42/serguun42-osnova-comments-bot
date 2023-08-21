import { resolve } from 'node:path';
import fetch from 'node-fetch';
import { createCanvas, loadImage, registerFont, Image as CanvasImage } from 'canvas';
import { EmojiRegexp, MentionRegexp } from '../util/regexps.js';
import EmojiToUnicode from '../util/emoji-to-unicode.js';
import { FromUnixTimestamp, DAY, MINUTE, MONTHS_SHORT } from '../util/time.js';
import LoadConfig from '../util/load-config.js';
import LogMessageOrError from '../util/log.js';
import IS_DEV from '../util/is-dev.js';

const { CDN_DOMAIN, HEADERS_FOR_FETCHING } = LoadConfig();

registerFont(resolve('fonts', 'Roboto-Light.ttf'), { family: 'Roboto', weight: '300' });
registerFont(resolve('fonts', 'Roboto-Regular.ttf'), { family: 'Roboto', weight: '400' });
registerFont(resolve('fonts', 'Roboto-Bold.ttf'), { family: 'Roboto', weight: '700' });

if (IS_DEV) registerFont(resolve('fonts', 'SegoeUIEmoji.ttf'), { family: 'Segoe UI Emoji' });
else registerFont(resolve('fonts', 'NotoColorEmoji.ttf'), { family: 'Noto Color Emoji' });

const EMOJI_FONT = IS_DEV ? 'Segoe UI Emoji' : 'Noto Color Emoji';

/**
 * @typedef {object} FillRectDTO
 * @property {import('canvas').CanvasRenderingContext2D} ctx
 * @property {number} width
 * @property {number} height
 * @property {number} top
 * @property {number} left
 * @property {number} borderRadius
 * @property {string} fillingColor
 */
/**
 * @param {FillRectDTO} fillRectDTO
 * @returns {void}
 */
const FillRectWithBorderRadius = ({ ctx, width, height, top, left, borderRadius, fillingColor }) => {
  /** Saving canvas' state to restore up to this later */
  ctx.save();
  /**
   * Creating circle to draw an image in
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/arc
   * https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clip
   */
  ctx.beginPath();
  /**
   * Rounded edges with quadraticCurveTo
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/quadraticCurveTo
   */
  ctx.moveTo(left + borderRadius, top);
  ctx.lineTo(left + width - borderRadius, top);
  ctx.quadraticCurveTo(left + width, top, left + width, top + borderRadius);
  ctx.lineTo(left + width, top + height - borderRadius);
  ctx.quadraticCurveTo(left + width, top + height, left + width - borderRadius, top + height);
  ctx.lineTo(left + borderRadius, top + height);
  ctx.quadraticCurveTo(left, top + height, left, top + height - borderRadius);
  ctx.lineTo(left, top + borderRadius);
  ctx.quadraticCurveTo(left, top, left + borderRadius, top);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = fillingColor;
  ctx.fillRect(left, top, width, height);

  ctx.restore();
};

/**
 * @param {import('../types/comment-to-build').CommentToBuild} commentData
 * @returns {Promise<import('../types/built-comment').BuiltComment>}
 */
const BuildSingleImage = (commentData) => {
  const fontSize = commentData.text?.length > 50 ? 64 : 84;
  const commentBodyColor = '#121212';
  const headFontSize = 84;
  const commentHeadColor = '#444444';
  const commentHeadDateColor = '#666666';
  const mentionColor = '#346EB8';

  let heightForCanvas = 400;

  /**
   * @param {string} text
   * @param {number} maxTextWidth
   * @param {number} fontSizeInLine
   * @param {string} [fontWeight]
   * @param {{verified: boolean}} [additionalLinesParams]
   * @returns {import('../types/canvas-entities').GotLines}
   */
  const GetLines = (text, maxTextWidth, fontSizeInLine, fontWeight = '400', additionalLinesParams = {}) => {
    const finalMaxWidth = additionalLinesParams?.verified ? maxTextWidth - fontSizeInLine * 2 : maxTextWidth;
    const canvasForTest = createCanvas(3000, 100);
    const ctxForTest = canvasForTest.getContext('2d');

    ctxForTest.font = `${fontWeight} ${fontSizeInLine}px "Roboto"`;
    ctxForTest.fillStyle = '#121212';

    /** @type {string[]} */
    const allEmojiesFromMessage = Array.from(text.match(EmojiRegexp) || []);
    let emojiIndex = 0;

    text = text.replace(EmojiRegexp, '👁');

    /** @type {import('../types/canvas-entities').ComplexMiddleLine[]} */
    const linesForReturn = [];

    text.split('\n').forEach((completeLine) => {
      let leftLine = completeLine;
      let offsetFixer = 0;

      /** @type {string[]} */
      const localLines = [];

      /** @type {{value: string, start: number, length: number, lineIndex: number}[]} */
      const mentionsPositions = [];

      if (MentionRegexp.test(leftLine)) {
        leftLine = leftLine.replace(MentionRegexp, (triggeredLine, mentionName, offset) => {
          const mentionToPlace = `@${mentionName.replace(/\s/g, '\u00A0')}`;

          mentionsPositions.push({
            value: mentionToPlace,
            start: offset - offsetFixer,
            length: mentionName.length + 1, // +1 – for `@`
          });

          offsetFixer += triggeredLine.length - mentionName.length - 1;

          return mentionToPlace;
        });
      }

      while (leftLine.length) {
        let maxPossibleLength = leftLine.length;
        while (ctxForTest.measureText(leftLine.slice(0, maxPossibleLength)).width >= finalMaxWidth) maxPossibleLength--;

        const maxPossibleLine = leftLine.slice(0, maxPossibleLength);

        let lastWordEndIndex = 0;
        if (maxPossibleLength !== leftLine.length)
          while (maxPossibleLine.indexOf(' ', lastWordEndIndex) !== -1)
            lastWordEndIndex = maxPossibleLine.indexOf(' ', lastWordEndIndex) + 1;

        const localLine = maxPossibleLine.slice(0, lastWordEndIndex || maxPossibleLine.length);

        mentionsPositions.forEach((mentionPosition) => {
          const previousLocalLinesLength = localLines.reduce((accum, current) => accum + current.length, 0);

          if (
            (mentionPosition.lineIndex === null || mentionPosition.lineIndex === undefined) &&
            mentionPosition.start >= previousLocalLinesLength &&
            mentionPosition.start < previousLocalLinesLength + localLine.length
          ) {
            mentionPosition.start -= previousLocalLinesLength;
            mentionPosition.lineIndex = localLines.length;
          }
        });

        localLines.push(localLine);

        leftLine = leftLine.slice(localLines[localLines.length - 1].length, leftLine.length);
      }

      localLines.forEach((localLine, localLineIndex) => {
        /** @type {import('../types/canvas-entities').AdditionalTextEntity[]} */
        const additionalEntitiesForLocalLine = [];

        mentionsPositions.forEach((mentionPosition) => {
          if (mentionPosition.lineIndex === localLineIndex) {
            const offsetLeft = ctxForTest.measureText(localLine.slice(0, mentionPosition.start)).width;
            const mentionWidth = ctxForTest.measureText(mentionPosition.value).width;

            additionalEntitiesForLocalLine.push({
              type: 'mention',
              value: mentionPosition.value,
              offsetLeft,
              mentionWidth,
            });
          }
        });

        linesForReturn.push({
          lineText: localLine,
          additionalEntities: additionalEntitiesForLocalLine,
        });
      });
    });

    return linesForReturn.map((complexMiddleLine, complexMiddleLineIndex) => {
      const { additionalEntities } = complexMiddleLine;
      let { lineText } = complexMiddleLine;

      if (EmojiRegexp.test(lineText)) {
        const splittedByEmojies = lineText.split(EmojiRegexp);
        const metrics = [];

        splittedByEmojies.forEach((partOfLine) => {
          const offsetLeft = metrics.reduce((accumulator, value) => accumulator + value, 0);

          if (EmojiRegexp.test(partOfLine)) {
            ctxForTest.font = `${fontSizeInLine}px "${EMOJI_FONT}"`;

            const currentMetrics = ctxForTest.measureText(partOfLine);

            metrics.push(currentMetrics.width);

            additionalEntities.push({
              type: 'emoji',
              value: allEmojiesFromMessage[emojiIndex++],
              offsetLeft,
              width: currentMetrics.width,
              height: currentMetrics.actualBoundingBoxAscent + currentMetrics.actualBoundingBoxDescent,
            });
          } else {
            ctxForTest.font = `${fontWeight} ${fontSizeInLine}px Roboto`;

            metrics.push(ctxForTest.measureText(partOfLine).width);
          }
        });

        lineText = lineText.replace(EmojiRegexp, '👁');
      }

      if (additionalLinesParams?.verified && !complexMiddleLineIndex) {
        ctxForTest.font = `${fontWeight} ${fontSizeInLine}px "Roboto"`;

        additionalEntities.push({
          type: 'verified',
          offsetLeft: ctxForTest.measureText(lineText).width + fontSizeInLine * 0.35,
          verifiedSize: fontSizeInLine * 0.8,
        });
      }

      if (additionalEntities.length) return { type: 'complex', text: lineText, additionalEntities };
      return { type: 'simple', text: lineText };
    });
  };

  /** @type {import('../types/canvas-entities').GotLines} */
  let linesForRealCanvas = [];

  /** Text calculation */
  if (commentData.text) {
    linesForRealCanvas = GetLines(commentData.text, 1800, fontSize, '400', { verified: false });
    heightForCanvas += fontSize * 1.2 * linesForRealCanvas.length + 32;
  }

  const donateTopPosition = heightForCanvas - 100 + 64;

  /** Donate calculation */
  if (commentData.donate?.count > 0) heightForCanvas += fontSize * 2 + 64;

  /** @type {import('../types/canvas-entities').ImageToDraw[]} */
  const imagesToDraw = [];

  /** Media calculation */
  if (commentData.attaches?.length) {
    const MAX_IMAGE_HEIGHT = 1500;

    commentData.attaches
      .filter((media) => media.type === 'image')
      .forEach(
        /** @param {import('../types/comment-from-api').CommentAttachTypeMedia} media */ (media) => {
          const ratio = media.data.width / media.data.height;

          let widthForImage = media.data.width > 900 ? 1800 : media.data.width < 250 ? 500 : media.data.width * 2;
          let heightForImage = widthForImage / ratio;

          if (heightForImage > MAX_IMAGE_HEIGHT) {
            heightForImage = MAX_IMAGE_HEIGHT;
            widthForImage = heightForImage * ratio;
          }

          const marginLeft = (1800 - widthForImage) / 2;

          imagesToDraw.push({
            url: new URL(media.data.uuid, CDN_DOMAIN),
            x: 100 + marginLeft,
            y: heightForCanvas - 100 + 64,
            height: heightForImage,
            width: widthForImage,
            round: false,
          });

          heightForCanvas += heightForImage + 64;
        }
      );
  }

  const canvas = createCanvas(2000, heightForCanvas);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 2000, heightForCanvas);

  if (commentData.text) {
    linesForRealCanvas.forEach((lineForRealCanvas, lineForRealCanvasIndex) => {
      ctx.font = `400 ${fontSize}px "Roboto"`;
      ctx.fillStyle = commentBodyColor;
      ctx.fillText(lineForRealCanvas.text, 100, 332 + fontSize + fontSize * 1.2 * lineForRealCanvasIndex);

      if (lineForRealCanvas.type === 'complex') {
        lineForRealCanvas.additionalEntities.forEach((additionalEntity) => {
          if (additionalEntity.type === 'mention') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(
              100 + additionalEntity.offsetLeft,
              332 + fontSize * 1.2 * lineForRealCanvasIndex + 10,
              additionalEntity.mentionWidth,
              fontSize * 1.2
            );

            ctx.font = `400 ${fontSize}px "Roboto"`;
            ctx.fillStyle = mentionColor;
            ctx.fillText(
              additionalEntity.value,
              100 + additionalEntity.offsetLeft,
              332 + fontSize + fontSize * 1.2 * lineForRealCanvasIndex
            );

            ctx.strokeStyle = mentionColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(
              100 + additionalEntity.offsetLeft,
              332 + fontSize + fontSize * 1.2 * lineForRealCanvasIndex + 20
            );
            ctx.lineTo(
              100 + additionalEntity.offsetLeft + additionalEntity.mentionWidth,
              332 + fontSize + fontSize * 1.2 * lineForRealCanvasIndex + 20
            );
            ctx.stroke();
            ctx.closePath();
          } else if (additionalEntity.type === 'emoji') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(
              100 + additionalEntity.offsetLeft,
              332 + fontSize * 1.2 * lineForRealCanvasIndex + 10,
              fontSize * 1.25,
              fontSize * 1.25
            );

            imagesToDraw.push({
              path: resolve('fonts', 'png', `${EmojiToUnicode(additionalEntity.value)}.png`),
              width: fontSize,
              height: fontSize,
              x: 100 + additionalEntity.offsetLeft,
              y: 332 + fontSize * 1.2 * lineForRealCanvasIndex + 8,
              round: false,
            });
          }
        });
      }
    });
  }

  if (commentData.donate?.count > 0) {
    const donateBadgeBackground = '#444477';
    const donateBadgeColor = '#FFFFFF';
    const donateBadgeText = `${commentData.donate.count} ₽`;
    const donateFontSize = 84;
    const donateBadgeFont = `400 ${donateFontSize}px "Roboto"`;
    const donateBadgePadding = donateFontSize * 0.8;

    ctx.font = donateBadgeFont;

    const donateBadgeWidth = ctx.measureText(donateBadgeText).width + donateBadgePadding * 2;
    const donateBadgeHeight = donateFontSize * 2;
    const donateBadgeBorderRadius = donateFontSize / 1.75;

    FillRectWithBorderRadius({
      ctx,
      width: donateBadgeWidth,
      height: donateBadgeHeight,
      top: donateTopPosition,
      left: 100,
      borderRadius: donateBadgeBorderRadius,
      fillingColor: donateBadgeBackground,
    });

    ctx.fillStyle = donateBadgeColor;
    ctx.font = donateBadgeFont;
    ctx.fillText(donateBadgeText, 100 + donateBadgePadding, donateTopPosition + donateFontSize * 1.35);
  }

  const commentHeadLines = GetLines(commentData.author.name || '', 1240, headFontSize, '700', {
    verified: commentData.author.is_verified,
  });

  const commentHeadText = commentHeadLines[0];
  if (commentHeadLines[1]) commentHeadText.text += '…';

  /** For username and date texts */
  const headTopPlacing = 180;

  if (commentHeadText.type === 'simple') {
    ctx.font = `700 ${headFontSize}px Roboto`;
    ctx.fillStyle = commentHeadColor;
    ctx.fillText(commentHeadText.text, 350, headTopPlacing);
  } else if (commentHeadText.type === 'complex') {
    ctx.font = `700 ${headFontSize}px Roboto`;
    ctx.fillStyle = commentHeadColor;
    ctx.fillText(commentHeadText.text, 350, headTopPlacing);

    commentHeadText.additionalEntities.forEach((additionalEntity) => {
      if (additionalEntity.type === 'emoji') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(additionalEntity.offsetLeft + 350, headTopPlacing - headFontSize, 110, 110);

        imagesToDraw.push({
          path: resolve('fonts', 'png', `${EmojiToUnicode(additionalEntity.value)}.png`),
          width: 90,
          height: 90,
          x: additionalEntity.offsetLeft + 350,
          y: headTopPlacing - headFontSize,
          round: false,
        });
      } else if (additionalEntity.type === 'verified') {
        imagesToDraw.push({
          path: resolve('fonts', 'verified.png'),
          width: additionalEntity.verifiedSize,
          height: additionalEntity.verifiedSize,
          x: additionalEntity.offsetLeft + 350 + (commentHeadLines[1] ? additionalEntity.verifiedSize : 0),
          y: headTopPlacing - additionalEntity.verifiedSize * 0.9,
          round: false,
        });
      }
    });
  }

  const timeZoneDiff = (IS_DEV ? new Date().getTimezoneOffset() : -180) * -MINUTE;
  const dateDiff = Date.now() - FromUnixTimestamp(commentData.date);
  const dateObject = new Date(FromUnixTimestamp(commentData.date) + timeZoneDiff);
  const isToday =
    FromUnixTimestamp(commentData.date) - (FromUnixTimestamp(commentData.date) % DAY) ===
    Date.now() - (Date.now() % DAY);
  const isYesterday =
    FromUnixTimestamp(commentData.date) - (FromUnixTimestamp(commentData.date) % DAY) ===
    Date.now() - (Date.now() % DAY) - DAY;
  const timeString = `${dateObject.getHours().toString().padStart(2, '0')}:${dateObject
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
  const dateString = isToday
    ? timeString
    : isYesterday
    ? `Вчера, ${timeString}`
    : dateDiff < 30 * DAY
    ? `${dateObject.getDate()} ${MONTHS_SHORT[dateObject.getMonth()]}, ${timeString}`
    : `${dateObject.getDate()} ${MONTHS_SHORT[dateObject.getMonth()]} ${dateObject.getFullYear()}`;
  const dateFontSize = 48;

  ctx.font = `300 ${dateFontSize}px "Roboto Light"`;
  ctx.fillStyle = commentHeadDateColor;
  ctx.fillText(dateString, 350, 250);

  if (commentData.replyTo && !commentData.hideReply) {
    const parentComment = commentData.allComments.find((matching) => matching.id === commentData.replyTo);

    const replyToName = parentComment?.author?.name;
    const replyToVerified = parentComment?.author?.is_verified;

    if (replyToName) {
      const dateStringWidth = ctx.measureText(dateString).width;
      const replyToNameLines = GetLines(replyToName, 1000, dateFontSize, '300', { verified: replyToVerified });
      const replyToNameText = replyToNameLines[0];
      const offsetForReplyToNameText = 350 + dateStringWidth + 50 + 42 + 8;

      imagesToDraw.push({
        path: resolve('fonts', 'reply_icon.png'),
        width: 56,
        height: 56,
        x: 350 + dateStringWidth + 30,
        y: 250 - 44,
        round: false,
      });

      if (replyToNameText.type === 'simple') {
        ctx.font = `300 ${dateFontSize}px "Roboto Light"`;
        ctx.fillStyle = commentHeadDateColor;
        ctx.fillText(replyToNameText.text, offsetForReplyToNameText, 250);
      } else if (replyToNameText.type === 'complex') {
        ctx.font = `300 ${dateFontSize}px "Roboto Light"`;
        ctx.fillStyle = commentHeadDateColor;
        ctx.fillText(replyToNameText.text, offsetForReplyToNameText, 250);

        replyToNameText.additionalEntities.forEach((additionalEntity) => {
          if (additionalEntity.type === 'emoji') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(
              additionalEntity.offsetLeft + offsetForReplyToNameText - 4,
              250 - dateFontSize,
              dateFontSize * 1.25,
              dateFontSize * 1.25
            );

            imagesToDraw.push({
              path: resolve('fonts', 'png', `${EmojiToUnicode(additionalEntity.value)}.png`),
              width: dateFontSize,
              height: dateFontSize,
              x: additionalEntity.offsetLeft + offsetForReplyToNameText,
              y: 250 - dateFontSize,
              round: false,
            });
          } else if (additionalEntity.type === 'verified') {
            imagesToDraw.push({
              path: resolve('fonts', 'verified.png'),
              width: additionalEntity.verifiedSize,
              height: additionalEntity.verifiedSize,
              x: additionalEntity.offsetLeft + offsetForReplyToNameText,
              y: 250 - additionalEntity.verifiedSize * 0.9,
              round: false,
            });
          }
        });
      }
    }
  }

  const karmaPositive = commentData.likes?.count > 0;
  const karmaBackgroundColor = karmaPositive ? '#E5545E1F' : '#DDDDDD';
  const karmaTextColor = karmaPositive ? '#E65151' : '#555555';
  const karmaIcon = karmaPositive ? 'heart_filled' : 'heart_outline';
  const karmaText = commentData.likes?.count?.toString() || '0';

  ctx.font = `400 ${headFontSize}px "Roboto"`;

  const karmaMetrics = ctx.measureText(karmaText);
  const karmaHeight = karmaMetrics.actualBoundingBoxAscent + karmaMetrics.actualBoundingBoxDescent;
  const karmaIconHeight = karmaHeight;
  const karmaIconWidth = (karmaHeight * 854) / 726;
  const karmaIconPadding = karmaIconWidth * 0.5;
  const karmaWidth = karmaMetrics.width + karmaIconWidth + karmaIconPadding;
  const karmaHorizontalPadding = 48;
  const karmaVerticalPadding = 24;
  const karmaTextTop = 215;
  const karmaTextLeft = 1900 - karmaWidth - karmaHorizontalPadding;
  const karmaBoxLeft = karmaTextLeft - karmaHorizontalPadding;
  const karmaBoxTop = karmaTextTop - headFontSize;
  const karmaBoxWidth = karmaWidth + karmaHorizontalPadding * 2;
  const karmaBoxHeight = karmaHeight + karmaVerticalPadding * 2;
  const karmaBoxBorderRadius = karmaBoxHeight / 2;

  FillRectWithBorderRadius({
    ctx,
    width: karmaBoxWidth,
    height: karmaBoxHeight,
    top: karmaBoxTop,
    left: karmaBoxLeft,
    borderRadius: karmaBoxBorderRadius,
    fillingColor: karmaBackgroundColor,
  });

  imagesToDraw.push({
    path: resolve('fonts', `${karmaIcon}.png`),
    width: karmaIconWidth,
    height: karmaIconHeight,
    x: karmaTextLeft,
    y: karmaTextTop - karmaIconHeight,
    round: false,
  });

  ctx.fillStyle = karmaTextColor;
  ctx.font = `400 ${headFontSize}px "Roboto"`;
  ctx.fillText(karmaText, karmaTextLeft + karmaIconWidth + karmaIconPadding, karmaTextTop);

  const userAvatarUrl = `https://leonardo.osnova.io/${
    commentData.author.avatar.data.uuid || ''
  }/-/scale_crop/340x340/center/`;

  imagesToDraw.push({
    url: userAvatarUrl,
    x: 100,
    y: 100,
    width: 170,
    height: 170,
    round: true,
  });

  return Promise.all(
    imagesToDraw.map((imageToDraw) => {
      /** @type {Promise<CanvasImage>} */
      const loadingImage = imageToDraw.url
        ? fetch(imageToDraw.url, { headers: HEADERS_FOR_FETCHING })
            .then((res) => {
              if (res.ok) return res.arrayBuffer();

              return Promise.reject(new Error(`Status code ${res.status} ${res.statusText} @ ${imageToDraw.url}`));
            })
            .then((imageBuffer) => {
              const image = new CanvasImage();
              image.src = Buffer.from(imageBuffer);

              return Promise.resolve(image);
            })
        : loadImage(imageToDraw.path);

      return loadingImage
        .then((imageReadyData) => {
          if (imageToDraw.round) {
            /** Saving canvas' state to restore up to this later */
            ctx.save();

            /**
             * Creating circle to draw an image in
             *
             * https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/arc
             * https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clip
             */
            ctx.beginPath();
            ctx.arc(
              imageToDraw.x + imageToDraw.width / 2,
              imageToDraw.y + imageToDraw.height / 2,
              Math.min(imageToDraw.width, imageToDraw.height) / 2,
              0,
              Math.PI * 2
            );
            ctx.closePath();
            ctx.clip();

            ctx.drawImage(imageReadyData, imageToDraw.x, imageToDraw.y, imageToDraw.width, imageToDraw.height);

            ctx.restore();
          } else {
            ctx.drawImage(imageReadyData, imageToDraw.x, imageToDraw.y, imageToDraw.width, imageToDraw.height);
          }
        })
        .catch(LogMessageOrError)
        .finally(() => Promise.resolve());
    })
  )
    .then(() =>
      Promise.resolve({
        link: commentData.link,
        postID: commentData.postID,
        commentID: commentData.id,
        buffer: canvas.toBuffer('image/jpeg', { quality: 1, progressive: true }),
      })
    )
    .catch((e) => {
      LogMessageOrError(e);

      return Promise.resolve({
        link: commentData.link,
        postID: commentData.postID,
        commentID: commentData.id,
        buffer: Buffer.alloc(0),
      });
    });
};

/**
 * @param {import('../types/comment-to-build').CommentToBuild[]} comments
 * @returns {Promise<import('../types/built-comment').BuiltComment[]>}
 */
const BuildImages = (comments) => Promise.all(comments.filter(Boolean).map(BuildSingleImage));

export default BuildImages;

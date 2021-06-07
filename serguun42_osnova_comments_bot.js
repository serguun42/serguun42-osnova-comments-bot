const
	fs = require("fs"),
	http = require("http"),
	{ join } = require("path"),
	DEV = require("os").platform() === "win32" || process.argv[2] === "DEV",
	{ createCanvas, loadImage, registerFont, Image: CanvasImage } = require("canvas"),
	EmojiRegexp = /([\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}])/ug,
	MentionRegexp = /\[\@\d+\|([^\]]+)\]/g,
	NodeFetch = require("node-fetch"),
	Telegraf = require("telegraf");



registerFont("./fonts/Roboto-Light.ttf", { family: "Roboto", weight: "300" });
registerFont("./fonts/Roboto-Regular.ttf", { family: "Roboto", weight: "400" });
registerFont("./fonts/Roboto-Bold.ttf", { family: "Roboto", weight: "700" });

if (DEV)
	registerFont("./fonts/SegoeUIEmoji.ttf", { family: "Segoe UI Emoji" });
else
	registerFont("./fonts/NotoColorEmoji.ttf", { family: "Noto Color Emoji" });

const EMOJI_FONT = DEV ? "Segoe UI Emoji" : "Noto Color Emoji";



const
	CONFIG = DEV ? require("./serguun42_osnova_comments_bot.config.mine.json") : require("./serguun42_osnova_comments_bot.config.json"),
	{
		TELEGRAM_BOT_TOKEN,
		CMTT_PLATFORMS,
		ADMIN_TELEGRAM_DATA,
		CHATS_LIST,
		COMMANDS_WHITELIST,
		BLACKLIST,
		LOCAL_SERVER_PORT,
		LOCAL_HTTP_BYPASS_SERVER_PORT,
		DUMPING_FOLDER,
		HEADERS_FOR_FETCHING
	} = CONFIG,
	COMMANDS_USAGE = new Object(),
	COMMANDS = {
		"help": `Что я умею?

Вы добавляете меня в чат – на сообщения с ссылками на комментарий я отвечаю картинками и опционально картинками-документами в высоком разрешении.
В сообщении может быть несколько ссылок на комментарии с разных платформ – TJournal, DTF, VC.

Все вопросы – <a href="https://t.me/${ADMIN_TELEGRAM_DATA.username}">${ADMIN_TELEGRAM_DATA.username}</a>`,
	};



const telegraf = new Telegraf.Telegraf(TELEGRAM_BOT_TOKEN, DEV ? {} : LOCAL_SERVER_PORT ? {
	telegram: {
		apiRoot: `http://127.0.0.1:${LOCAL_SERVER_PORT}`
	}
} : {});
const telegram = telegraf.telegram;



/**
 * @param {String} iQuery
 * @returns {{[queryName: string]: string | true}}
 */
const GlobalParseQuery = iQuery => {
	if (!iQuery) return {};

	const returningList = {};

	iQuery.toString().replace(/^\?/, "").split("&").forEach((queryPair) => {
		try {
			if (queryPair.split("=")[1])
				returningList[queryPair.split("=")[0]] = decodeURIComponent(queryPair.split("=")[1]);
			else
				returningList[queryPair.split("=")[0]] = true;
		} catch (e) {
			returningList[queryPair.split("=")[0]] = (queryPair.split("=")[1] || true);
		};
	});

	return returningList;
};

/**
 * @param {String} emoji
 * @returns {Number}
 */
const EmojiToUnicode = emoji => {
	/** @type {Number} */
	let comp = -1;

	if (emoji.length === 1)
		return emoji.charCodeAt(0).toString(16);

	comp = (
		(emoji.charCodeAt(0) - 0xD800) * 0x400
		+ (emoji.charCodeAt(1) - 0xDC00) + 0x10000
	);

	if (comp < 0) comp = emoji.charCodeAt(0);

	return comp.toString("16");
};

/**
 * @param {import("telegraf/typings/core/types/typegram").User} from
 * @returns {Boolean}
 */
const CheckForCommandAvailability = (from) => {
	let pass = false;
	if (from.username && COMMANDS_WHITELIST.includes(from.username))
		pass = true;
	else if ((from.username && BLACKLIST.includes(from.username)) || (from.id && BLACKLIST.includes(from.id)))
		pass = false;
	else {
		let lastTimeCalled = COMMANDS_USAGE[from.id];
			COMMANDS_USAGE[from.id] = Date.now();

		if (!lastTimeCalled || typeof lastTimeCalled == "undefined")
			pass = true;
		else if ((Date.now() - lastTimeCalled) > 15 * 60 * 1e3)
			pass = true;
	};

	return pass;
};

/**
 * @param  {Error[] | String[]} args
 * @returns {void}
 */
const LogMessageOrError = (...args) => {
	const containsAnyError = (args.findIndex((message) => message instanceof Error) > -1),
		  out = (containsAnyError ? console.error : console.log);

	out(new Date());
	args.forEach((message) => out(message));
	out("~~~~~~~~~~~\n\n");


	if (DEV) fs.writeFile("./out/logmessageorerror.json", JSON.stringify([...args], false, "\t"), () => {});
};



/**
 * @typedef {Object} AuthorType
 * @property {Number} id
 * @property {String} name
 * @property {String} avatar_url
 * @property {Boolean} is_verified
 * 
 * @typedef {Object} CommentData
 * @property {String} link
 * @property {Number} commentID
 * @property {String} authorAvatar
 * @property {String} authorName
 * @property {String} authorID
 * @property {Boolean} authorVerified
 * @property {String} likes
 * @property {String} text
 * @property {Number} date
 * @property {Number} [donate]
 * @property {String | {author: AuthorType}} [replyTo]
 * @property {{url: string, size: {width: number, height: number, ratio: number}}[]} [media]
 */
/**
 * @typedef {Object} ParsedCommentData
 * @property {String} host
 * @property {Number} entryID
 * @property {Number} commentID
 * @property {Boolean} hideReply
 */
/**
 * @param {TelegramMessageObject} message
 * @returns {Promise<ParsedCommentData[]>, { code: String }>}
 */
const GlobalParseMessageForLinksToComments = (message) => new Promise((resolve, reject) => {
	if (!message.entities || !message.entities.length) return reject({ code: "No URLs in message" });


	/**
	 * @type {ParsedCommentData[]}
	 */
	const parsedCommentsData = [];


	message.entities.forEach((entity) => {
		let urlFromEntity = "";

		if (entity.type === "url") {
			urlFromEntity = message.text.slice(entity.offset, entity.offset + entity.length);
		} else if (entity.type === "text_link") {
			urlFromEntity = entity.url;
		} else
			return;

		try {
			const parsedURL = new URL(urlFromEntity),
				{ host, search, pathname } = parsedURL;

			if (search && pathname) {
				const queries = GlobalParseQuery(search);
				let hideReply = false;

				if (queries["comment"] && parseInt(queries["comment"])) {
					let entryID = 0,
						splitted = pathname.split("/").filter(i => !!i);

					if (parseInt(splitted[0])) entryID = parseInt(splitted[0]);

					if (splitted[0] === "u" || splitted[0] === "s") {
						if (splitted[2] && parseInt(splitted[2])) entryID = parseInt(splitted[2]);
					} else {
						if (splitted[1] && parseInt(splitted[1])) entryID = parseInt(splitted[1]);
					};

					if (queries["h"]) hideReply = true;

					if (entryID) {
						parsedCommentsData.push({
							host,
							entryID: entryID,
							commentID: parseInt(queries["comment"]),
							hideReply
						});
					};
				};
			};
		} catch (e) {};
	});


	const parsedCommentsDataFiltered = parsedCommentsData.filter((comment, index) => {
		if (!comment.entryID || !comment.commentID) return false;

		return parsedCommentsData.findIndex((commentToFind) => commentToFind.commentID === comment.commentID) === index;
	});


	if (parsedCommentsDataFiltered.length)
		return resolve(parsedCommentsDataFiltered);
	else
		return reject({ code: "No comments" });
});

/**
 * @param {ParsedCommentData[]} comments
 * @returns {Promise<CommentData[], {code: string}>}
 */
const GlobalGetComments = (comments) => {
	const entriesToFetch = comments.filter((comment, index) => {
		return comments.findIndex((commentToFind) =>
			commentToFind.host === comment.host && commentToFind.entryID === comment.entryID
		) === index;
	});


	return Promise.all(entriesToFetch.map((entryToFetch) => {
		/** @type {PlatformObject} */
		const platform = CMTT_PLATFORMS[entryToFetch.host];

		if (!platform) return Promise.resolve({ text: null });


		return NodeFetch(`${platform.apiURL}entry/${entryToFetch.entryID}/comments/popular`, {
			headers: {
				"X-Device-Token": platform.token,
				"User-agent": platform.userAgent
			},
			method: "GET"
		}).then((res) => {
			if (res.status === 200)
				return res.json();
			else
				return Promise.reject(`${platform.apiURL}entry/${entryToFetch.entryID}/comments/popular – ${res.status} ${res.statusText}`);
		}).then((data) => {
			return Promise.resolve({
				...entryToFetch,
				commentsFromAPI: data?.result || []
			});
		}).catch((e) => {
			LogMessageOrError(e);

			return Promise.resolve({ text: null });
		});
	})).then((fetchedEntries) => Promise.resolve(comments.map((comment) => {
		const correspondingEntry = fetchedEntries.find((fetchedEntry) => fetchedEntry.entryID === comment.entryID);
		if (!correspondingEntry) return { text: null };

		const { commentsFromAPI } = correspondingEntry;
		if (!commentsFromAPI) return { text: null };

		/** @type {CommentData} */
		let dataToResolve = { text: null };

		if (commentsFromAPI instanceof Array)
			commentsFromAPI.forEach((commentFromAPI) => {
				if (commentFromAPI.id === comment.commentID) {
					dataToResolve = {
						link: `https://${comment.host}/${comment.entryID}?comment=${comment.commentID}`,
						commentID: comment.commentID,
						authorAvatar: commentFromAPI.author.avatar_url,
						authorName: commentFromAPI.author.name,
						authorVerified: commentFromAPI.author.is_verified,
						likes: commentFromAPI.likes.summ,
						text: commentFromAPI.text,
						date: commentFromAPI.date * 1e3,
						replyTo: (commentFromAPI.replyTo && !comment.hideReply) ? commentsFromAPI.find((commentFromAPIToMatch) => commentFromAPIToMatch.id === commentFromAPI.replyTo) || "" : "",
						donate: commentFromAPI.donate?.count || null,
						...((commentFromAPI.media && commentFromAPI.media.length) ? {
							media: commentFromAPI.media.map(({ imageUrl, size }) => {
								return { url: imageUrl, size };
							}).filter(i => !!i)
						} : {})
					};
				};
			});

		return dataToResolve;
	})));
};

/**
 * @param {CommentData[]} comments
 * @returns {Promise<{buffer: Buffer, link: string, commentID: number}[], {code: string}>}
 */
const GlobalBuildImages = (comments) => {
	const JPEGsData = new Array(comments.length).fill(false);

	return new Promise((resolve) => {
		comments.forEach((commentData, commentIndex) => {
			const
				fontSize = commentData.text && commentData.text.length > 20 ? 64 : 84,
				commentBodyColor = "#121212",
				headFontSize = 84,
				commentHeadColor = "#444444",
				commentHeadDateColor = "#666666",
				mentionColor = "#346EB8";

			let heightForCanvas = 400;



			/**
			 * @typedef {Object} AdditionalTextEmojiEntity
			 * @property {"emoji"} type
			 * @property {String} value
			 * @property {Number} offsetLeft
			 * @property {Number} width
			 * @property {Number} height
			 * 
			 * @typedef {Object} AdditionalTextMentionEntity
			 * @property {"mention"} type
			 * @property {String} value
			 * @property {Number} offsetLeft
			 * @property {Number} mentionWidth
			 * 
			 * @typedef {Object} AdditionalTextVerifiedEntity
			 * @property {"verified"} type
			 * @property {Number} offsetLeft
			 * @property {Number} verifiedSize
			 * 
			 * @typedef {AdditionalTextEmojiEntity | AdditionalTextMentionEntity | AdditionalTextVerifiedEntity} AdditionalTextEntity
			 * 
			 * @typedef {{type: "simple" | "complex", text: string, additionalEntities?: AdditionalTextEntity[]}[]} GotLinesType
			 */
			/**
			 * 
			 * @param {String} text
			 * @param {Number} maxTextWidth
			 * @param {Number} fontSize
			 * @param {String} fontWeight
			 * @param {{verified: boolean}} [additionalLinesParams]
			 * @returns {GotLinesType}
			 */
			const LocalGetLines = (text, maxTextWidth, fontSize, fontWeight = "400", additionalLinesParams = {}) => {
				const canvasForTest = createCanvas(2000, 100);
				const ctxForTest = canvasForTest.getContext("2d");

				ctxForTest.font = `${fontWeight} ${fontSize}px "Roboto"`;
				ctxForTest.fillStyle = "#121212";


				/** @type {String[]} */
				const allEmojiesFromMessage = Array.from(text.match(EmojiRegexp) || []);
				let emojiIndex = 0;

				text = text.replace(EmojiRegexp.global, "👁");


				const linesSplittedByNewLineChar = text.split("\n");

				/**
				 * @typedef {Object} ComplexMiddleLine
				 * @property {String} lineText
				 * @property {AdditionalTextEntity[]} additionalEntities
				 */
				/** @type {ComplexMiddleLine[]} */
				const linesForReturn = [];

				let width = 0,
					i, j, result;


				linesSplittedByNewLineChar.forEach((lineSplittedByNewLineChar) => {
					let lineToCount = lineSplittedByNewLineChar,
						offsetFixer = 0;

					/** @type {String[]} */
					const localLines = [];

					/** @type {{value: string, start: number, length: number, lineIndex: number}[]} */
					const mentionsPositions = [];


					if (MentionRegexp.test(lineToCount)) {
						lineToCount = lineToCount.replace(MentionRegexp, (triggeredLine, mentionName, offset) => {
							const mentionToPlace = `@${mentionName.replace(/\s/g, "\u00A0")}`;

							mentionsPositions.push({
								value: mentionToPlace,
								start: offset - offsetFixer,
								length: mentionName.length + 1 // +1 – for `@`
							});

							offsetFixer += triggeredLine.length - mentionName.length - 1;

							return mentionToPlace;
						});
					};


					while (lineToCount.length) {
						for (i = lineToCount.length; ctxForTest.measureText(lineToCount.substr(0, i)).width > (additionalLinesParams?.verified ? maxTextWidth - fontSize * 2 : maxTextWidth); i--);

						result = lineToCount.substr(0, i);

						if (i !== lineToCount.length)
							for (j = 0; result.indexOf(" ", j) !== -1; j = result.indexOf(" ", j) + 1);

						const localLine = result.substr(0, j || result.length);
						mentionsPositions.forEach((mentionPosition) => {
							const previousLocalLinesLength = localLines.reduce((accum, current) => accum += current.length, 0);

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

						width = Math.max(width, ctxForTest.measureText(localLines[localLines.length - 1]).width);
						lineToCount = lineToCount.substr(localLines[localLines.length - 1].length, lineToCount.length);
					};


					localLines.forEach((localLine, localLineIndex) => {
						/** @type {AdditionalTextEntity[]} */
						const additionalEntitiesForLocalLine = [];

						mentionsPositions.forEach((mentionPosition) => {
							if (mentionPosition.lineIndex === localLineIndex) {
								const offsetLeft = ctxForTest.measureText(localLine.slice(0, mentionPosition.start)).width,
									  mentionWidth = ctxForTest.measureText(mentionPosition.value).width;

								additionalEntitiesForLocalLine.push({
									type: "mention",
									value: mentionPosition.value,
									offsetLeft,
									mentionWidth
								});
							};
						});

						linesForReturn.push({
							lineText: localLine,
							additionalEntities: additionalEntitiesForLocalLine
						});
					});
				});


				return linesForReturn.map((complexMiddleLine, complexMiddleLineIndex) => {
					const { additionalEntities } = complexMiddleLine;
					let { lineText } = complexMiddleLine;


					if (EmojiRegexp.test(lineText)) {
						const splittedByEmojies = lineText.split(EmojiRegexp),
							  metrics = [];


						splittedByEmojies.forEach((partOfLine) => {
							const offsetLeft = metrics.reduce((accumulator, value) => accumulator + value, 0);

							if (EmojiRegexp.test(partOfLine)) {
								ctxForTest.font = `${fontSize}px "${EMOJI_FONT}"`;


								const currentMetrics = ctxForTest.measureText(partOfLine);

								metrics.push(currentMetrics.width);

								additionalEntities.push({
									type: "emoji",
									value: allEmojiesFromMessage[emojiIndex++],
									offsetLeft,
									width: currentMetrics.width,
									height: currentMetrics.actualBoundingBoxAscent + currentMetrics.actualBoundingBoxDescent
								});
							} else {
								ctxForTest.font = `${fontWeight} ${fontSize}px Roboto`;

								metrics.push(ctxForTest.measureText(partOfLine).width);
							};
						});

						lineText = lineText.replace(EmojiRegexp.global, "•");
					}


					if (additionalLinesParams?.verified && !complexMiddleLineIndex) {
						ctxForTest.font = `${fontWeight} ${fontSize}px "Roboto"`;

						additionalEntities.push({
							type: "verified",
							offsetLeft: ctxForTest.measureText(lineText).width + fontSize * 0.35,
							verifiedSize: fontSize * 0.8
						});
					}


					if (additionalEntities.length)
						return { type: "complex", text: lineText, additionalEntities };
					else
						return { type: "simple", text: lineText };
				});
			};



			/** @type {GotLinesType} */
			let linesForRealCanvas = [];


			/** Text calculation */
			if (commentData.text) {
				linesForRealCanvas = LocalGetLines(commentData.text, 1800, fontSize, "400", { verified: false });
				heightForCanvas += (fontSize * 1.2) * linesForRealCanvas.length + 32;
			}


			const donateTopPosition = heightForCanvas - 100 + 64;

			/** Donate calculation */
			if (commentData.donate && commentData.donate > 0)
				heightForCanvas += fontSize * 2 + 64;


			/**
			 * @typedef {Object} RemoteImageToDraw
			 * @property {String} url
			 * @property {Number} x
			 * @property {Number} y
			 * @property {Number} width
			 * @property {Number} height
			 */
			/**
			 * @typedef {Object} LocalImageToDraw
			 * @property {String} path
			 * @property {Number} x
			 * @property {Number} y
			 * @property {Number} width
			 * @property {Number} height
			 */
			/** @type {(RemoteImageToDraw | LocalImageToDraw)[]} */
			const imagesToDraw = [];

			/**
			 * @returns {Promise<"Successfull">}
			 */
			const LocalDrawAllImages = () => new Promise((resolveDrawingImages) => {
				if (!imagesToDraw.length) return resolveDrawingImages("Successfull");

				const drawnImages = imagesToDraw.map(() => false);

				imagesToDraw.forEach((imageToDraw, imageIndex) => {
					/** @type {Promise<CanvasImage>} */
					const loadingImage = (imageToDraw.url ?
							NodeFetch(imageToDraw.url, {
								headers: { ...HEADERS_FOR_FETCHING }
							}).then((res) => {
								if (res.status === 200)
									return res.buffer();
								else
									return Promise.reject(new Error(`Status code ${res.status} ${res.statusText} @ ${imageToDraw.url}`));
							})
							.then((imageBuffer) => {
								const image = new CanvasImage();
								image.src = imageBuffer;

								return Promise.resolve(image);
							})
						:
							loadImage(imageToDraw.path)
					);


					loadingImage.then((imageReadyData) => {
						ctx.drawImage(imageReadyData, imageToDraw.x, imageToDraw.y, imageToDraw.width, imageToDraw.height);
					})
					.catch(LogMessageOrError)
					.finally(() => {
						drawnImages[imageIndex] = true;

						if (drawnImages.reduce((accumulator, current) => {
							if (current === false) accumulator += 1;
							return accumulator;
						}, 0) === 0) {
							return resolveDrawingImages("Successfull");
						};
					});
				});
			});

			/** Media calculation */
			if (commentData.media && commentData.media.length) {
				const MAX_IMAGE_HEIGHT = 1500;

				commentData.media.forEach((media) => {
					let widthForImage = media.size.width > 1800 ? 1800 : (media.size.width < 1500 ? 1500 : media.size.width),
						heightForImage = widthForImage / media.size.ratio;

					if (heightForImage > MAX_IMAGE_HEIGHT) {
						heightForImage = MAX_IMAGE_HEIGHT;
						widthForImage = heightForImage * media.size.ratio;
					};

					let marginLeft = (1800 - widthForImage) / 2;


					imagesToDraw.push({
						url: media.url,
						x: 100 + marginLeft,
						y: heightForCanvas - 100 + 64,
						height: heightForImage,
						width: widthForImage
					});

					heightForCanvas += heightForImage + 64;
				});
			}



			const canvas = createCanvas(2000, heightForCanvas);
			const ctx = canvas.getContext("2d");

			ctx.fillStyle = "#FFFFFF";
			ctx.fillRect(0, 0, 2000, heightForCanvas);


			if (commentData.text) {
				linesForRealCanvas.forEach((lineForRealCanvas, lineForRealCanvasIndex) => {
					ctx.font = `400 ${fontSize}px "Roboto"`;
					ctx.fillStyle = commentBodyColor;
					ctx.fillText(lineForRealCanvas.text, 100, 332 + fontSize + (fontSize * 1.2) * lineForRealCanvasIndex);

					if (lineForRealCanvas.type == "complex") {
						lineForRealCanvas.additionalEntities.forEach((additionalEntity) => {
							if (additionalEntity.type == "mention") {
								ctx.fillStyle = "#FFFFFF";
								ctx.fillRect(100 + additionalEntity.offsetLeft, 332 + (fontSize * 1.2) * lineForRealCanvasIndex + 10, additionalEntity.mentionWidth, fontSize * 1.2);


								ctx.font = `400 ${fontSize}px "Roboto"`;
								ctx.fillStyle = mentionColor;
								ctx.fillText(additionalEntity.value, 100 + additionalEntity.offsetLeft, 332 + fontSize + (fontSize * 1.2) * lineForRealCanvasIndex);


								ctx.strokeStyle = mentionColor;
								ctx.lineWidth = 2;
								ctx.beginPath();
								ctx.moveTo(100 + additionalEntity.offsetLeft, 332 + fontSize + (fontSize * 1.2) * lineForRealCanvasIndex + 20);
								ctx.lineTo(100 + additionalEntity.offsetLeft + additionalEntity.mentionWidth, 332 + fontSize + (fontSize * 1.2) * lineForRealCanvasIndex + 20);
								ctx.stroke();
								ctx.closePath();
							} else if (additionalEntity.type == "emoji") {
								ctx.fillStyle = "#FFFFFF";
								ctx.fillRect(100 + additionalEntity.offsetLeft, 332 + (fontSize * 1.2) * lineForRealCanvasIndex + 10, fontSize * 1.25, fontSize * 1.25);


								imagesToDraw.push({
									path: `./fonts/png/${EmojiToUnicode(additionalEntity.value)}.png`,
									width: fontSize,
									height: fontSize,
									x: 100 + additionalEntity.offsetLeft,
									y: 332 + (fontSize * 1.2) * lineForRealCanvasIndex + 8
								});
							}
						});
					};
				});
			}


			if (commentData.donate && commentData.donate > 0) {
				const donateBadgeBackground = "#444477",
					  donateBadgeColor = "#FFFFFF",
					  donateBadgeText = `${commentData.donate} ₽`,
					  donateBadgeFont = `400 ${fontSize}px "Roboto"`,
					  donateBadgePadding = fontSize * 0.8;

				ctx.font = donateBadgeFont;

				const donateBadgeWidth = ctx.measureText(donateBadgeText).width + donateBadgePadding * 2,
					  donateBadgeHeight = fontSize * 2,
					  donateBadgeCornerRadius = fontSize / 1.75;

				ctx.fillStyle = donateBadgeBackground;
				ctx.strokeStyle = donateBadgeBackground;
				ctx.lineJoin = "round";
				ctx.lineWidth = donateBadgeCornerRadius;

				ctx.strokeRect(100 + donateBadgeCornerRadius / 2, donateTopPosition + donateBadgeCornerRadius / 2, donateBadgeWidth - donateBadgeCornerRadius, donateBadgeHeight - donateBadgeCornerRadius);
				ctx.fillRect(100 + donateBadgeCornerRadius / 2, donateTopPosition + donateBadgeCornerRadius / 2, donateBadgeWidth - donateBadgeCornerRadius, donateBadgeHeight - donateBadgeCornerRadius);

				ctx.fillStyle = donateBadgeColor;
				ctx.font = donateBadgeFont;
				ctx.fillText(donateBadgeText, 100 + donateBadgePadding, donateTopPosition + fontSize * 1.4);
			}


			let commentHeadLines = LocalGetLines(commentData.authorName, 1240, headFontSize, "700", { verified: commentData.authorVerified }),
				commentHeadText = commentHeadLines[0];

			if (commentHeadLines[1]) commentHeadText.text += "…";


			/**
			 * For username and date texts
			 * @type {Number}
			 */
			const headTopPlacing = 180;


			if (commentHeadText.type == "simple") {
				ctx.font = `700 ${headFontSize}px Roboto`;
				ctx.fillStyle = commentHeadColor;
				ctx.fillText(commentHeadText.text, 350, headTopPlacing);
			} else if (commentHeadText.type == "complex") {
				ctx.font = `700 ${headFontSize}px Roboto`;
				ctx.fillStyle = commentHeadColor;
				ctx.fillText(commentHeadText.text, 350, headTopPlacing);


				commentHeadText.additionalEntities.forEach((additionalEntity) => {
					if (additionalEntity.type == "emoji") {
						ctx.fillStyle = "#FFFFFF";
						ctx.fillRect(additionalEntity.offsetLeft + 350, headTopPlacing - headFontSize, 110, 110);


						imagesToDraw.push({
							path: `./fonts/png/${EmojiToUnicode(additionalEntity.value)}.png`,
							width: 90,
							height: 90,
							x: additionalEntity.offsetLeft + 350,
							y: headTopPlacing - headFontSize
						});
					} else if (additionalEntity.type == "verified") {
						imagesToDraw.push({
							path: `./fonts/verified.png`,
							width: additionalEntity.verifiedSize,
							height: additionalEntity.verifiedSize,
							x: additionalEntity.offsetLeft + 350 + (commentHeadLines[1] ? additionalEntity.verifiedSize : 0),
							y: headTopPlacing - additionalEntity.verifiedSize * 0.9
						});
					};
				});
			};

			const diff = 3600e3 * 3,
				  day = 86400e3,
				  months = [ "янв", "фев", "мар", "апр", "мая", "июня", "июля", "авг", "сен", "окт", "ноя", "дек" ],
				  dateDiff = Date.now() - commentData.date,
				  dateObject = new Date(commentData.date + diff),
				  isToday = (commentData.date - commentData.date % day) === (Date.now() - Date.now() % day),
				  isYesterday = (commentData.date - commentData.date % day) === (Date.now() - Date.now() % day - day),
				  timeString = `${dateObject.getHours().toString().padStart(2, "0")}:${dateObject.getMinutes().toString().padStart(2, "0")}`,
				  dateString = (
						isToday ? timeString : (
							isYesterday ? `Вчера, ${timeString}` : (
								dateDiff < 30 * day ?
										`${dateObject.getDate()} ${months[dateObject.getMonth()]}, ${timeString}`
									:
										`${dateObject.getDate()} ${months[dateObject.getMonth()]} ${dateObject.getFullYear()}`
							)
						)
				  ),
				  dateFontSize = 48;

			ctx.font = `300 ${dateFontSize}px "Roboto Light"`;
			ctx.fillStyle = commentHeadDateColor;
			ctx.fillText(dateString, 350, 250);


			if (commentData.replyTo) {
				const replyToName = typeof commentData.replyTo === "string" ? commentData.replyTo : commentData.replyTo?.author?.name,
					  replyToVerified = typeof commentData.replyTo === "string" ? false : commentData.replyTo?.author?.is_verified;

				if (replyToName) {
					const dateStringWidth = ctx.measureText(dateString).width,
						  replyToNameLines = LocalGetLines(replyToName, 1000, dateFontSize, "300", { verified: replyToVerified }),
						  replyToNameText = replyToNameLines[0],
						  offsetForReplyToNameText = 350 + dateStringWidth + 50 + 42 + 8;

					imagesToDraw.push({
						path: "./fonts/reply_icon.png",
						width: 42,
						height: 42,
						x: 350 + dateStringWidth + 50,
						y: 250 - 42 + 4
					});

					if (replyToNameText.type == "simple") {
						ctx.font = `300 ${dateFontSize}px "Roboto Light"`;
						ctx.fillStyle = commentHeadDateColor;
						ctx.fillText(replyToNameText.text, offsetForReplyToNameText, 250);
					} else if (replyToNameText.type == "complex") {
						ctx.font = `300 ${dateFontSize}px "Roboto Light"`;
						ctx.fillStyle = commentHeadDateColor;
						ctx.fillText(replyToNameText.text, offsetForReplyToNameText, 250);


						replyToNameText.additionalEntities.forEach((additionalEntity) => {
							if (additionalEntity.type == "emoji") {
								ctx.fillStyle = "#FFFFFF";
								ctx.fillRect(additionalEntity.offsetLeft + offsetForReplyToNameText - 4, 250 - dateFontSize, dateFontSize * 1.25, dateFontSize * 1.25);


								imagesToDraw.push({
									path: `./fonts/png/${EmojiToUnicode(additionalEntity.value)}.png`,
									width: dateFontSize,
									height: dateFontSize,
									x: additionalEntity.offsetLeft + offsetForReplyToNameText,
									y: 250 - dateFontSize
								});
							} else if (additionalEntity.type == "verified") {
								imagesToDraw.push({
									path: `./fonts/verified.png`,
									width: additionalEntity.verifiedSize,
									height: additionalEntity.verifiedSize,
									x: additionalEntity.offsetLeft + offsetForReplyToNameText,
									y: 250 - additionalEntity.verifiedSize * 0.9
								});
							};
						});
					};
				};
			};


			let karmaBackgroundColor = "#DDDDDD",
				karmaTextColor = "#555555";

			if (commentData.likes < 0) {
				karmaBackgroundColor = "#FFF1F1";
				karmaTextColor = "#CD192E";
			} else if (commentData.likes > 0) {
				commentData.likes = "+" + commentData.likes;
				karmaBackgroundColor = "#EEFBF3";
				karmaTextColor = "#07A23b";
			};

			ctx.font = `700 ${headFontSize}px "Roboto"`;

			const karmaTopPlacing = 215,
				  karmaMetrics = ctx.measureText(commentData.likes),
				  karmaWidth = karmaMetrics.width,
				  karmaHeight = karmaMetrics.actualBoundingBoxAscent + karmaMetrics.actualBoundingBoxDescent;

			ctx.fillStyle = karmaBackgroundColor;
			ctx.fillRect(1900 - karmaWidth - 48 * 2, karmaTopPlacing - headFontSize, karmaWidth + 48 * 2, karmaHeight + 24 * 2);

			ctx.fillStyle = karmaTextColor;
			ctx.font = `700 ${headFontSize}px "Roboto"`;
			ctx.fillText(commentData.likes, 1900 - karmaWidth - 48, karmaTopPlacing);



			let userAvatarUrl = commentData.authorAvatar;

			try {
				const userAvatarUrlObject = new URL(userAvatarUrl);

				if (userAvatarUrlObject && userAvatarUrlObject.host === "leonardo.osnova.io") {
					if (userAvatarUrl[userAvatarUrl.length - 1] !== "/") userAvatarUrl += "/";
					userAvatarUrl += `-/scale_crop/340x340/center/`;
				};
			} catch (e) {};

			imagesToDraw.push({
				url: userAvatarUrl,
				x: 100,
				y: 100,
				width: 170,
				height: 170
			});



			LocalDrawAllImages().then(() => {
				JPEGsData[commentIndex] = {
					link: commentData.link,
					commentID: commentData.commentID,
					buffer: canvas.toBuffer("image/jpeg", { quality: 1, progressive: true })
				};

				if (JPEGsData.reduce((accumulator, current) => accumulator + !current, 0) === 0)
					return resolve(JPEGsData);
			});
		});
	});
};

/**
 * @param {import("telegraf").Context} ctx
 * @param {{buffer: Buffer, link: string, commentID: number}[]} screensData
 * @param {Boolean} [fullsize=false]
 */
const GlobalReplyWithImages = (ctx, screensData, fullsize = false) => {
	screensData = screensData.filter(screenData => !!screenData);


	screensData.forEach((screenData) => {
		if (DUMPING_FOLDER) {
			fs.writeFile(join(DUMPING_FOLDER, `comment_${screenData.commentID}_${Date.now()}`), screenData.buffer, (e) => e && LogMessageOrError(e));
		}


		ctx.replyWithPhoto({
			source: screenData.buffer,
			filename: `comment_halfsize_${screenData.commentID}.jpeg`
		}, {
			caption: `<a href="${encodeURI(screenData.link)}">${TGE(screenData.link)}</a>`,
			disable_web_page_preview: true,
			parse_mode: "HTML",
			reply_to_message_id: ctx.message.message_id
		})
		.catch(LogMessageOrError)
		.finally(() => {
			if (fullsize) {
				ctx.replyWithDocument({
					source: screenData.buffer,
					filename: `comment_full_${screenData.commentID}.jpeg`
				}, {
					disable_web_page_preview: true,
					reply_to_message_id: ctx.message.message_id
				}).catch(LogMessageOrError);
			};
		});
	});
};



const TGE = iStr => {
	if (!iStr) return "";

	if (typeof iStr === "string")
		return iStr
			.replace(/\&/g, "&amp;")
			.replace(/\</g, "&lt;")
			.replace(/\>/g, "&gt;");
	else
		return TGE(iStr.toString());
};

/**
 * @param {String} message
 */
const TelegramSendToAdmin = (message) => {
	if (!message) return;

	telegram.sendMessage(ADMIN_TELEGRAM_DATA.id, message, {
		parse_mode: "HTML",
		disable_notification: true
	}).catch(LogMessageOrError);
};

if (!DEV)
	TelegramSendToAdmin(`serguun42's Osnova Comments Bot have been spawned at ${new Date().toISOString()}`);



if (LOCAL_HTTP_BYPASS_SERVER_PORT) {
	http.createServer((req, res) => {
		if (req.method !== "POST") {
			res.statusCode = 405;
			res.end("405 Method Not Allowed");
			return;
		}


		/** @type {Number} */
		const specialChatID = CHATS_LIST.find((chat) => chat.special)?.id;
		if (!specialChatID) {
			res.statusCode = 404;
			res.end("404 Not Found");
			return;
		};


		new Promise((resolve, reject) => {
			const chunks = [];

			req.on("data", (chunk) => chunks.push(chunk));

			req.on("error", (e) => reject(e));

			req.on("end", () => resolve(Buffer.concat(chunks)));
		}).then(/** @param {Buffer} iRequestBuffer */ (iRequestBuffer) => {
			const payloadString = iRequestBuffer.toString();

			try {
				/** @type {CommentData} */
				const commentData = {
					...JSON.parse(payloadString),
					likes: 0,
					date: Date.now(),
				};
				const { authorAvatar, authorName, commentID, date, link, authorID, text } = commentData;

				if (
					!authorAvatar ||
					!authorName ||
					!commentID ||
					!date ||
					!link
				) return Promise.reject(`Did not pass some essential comment data`);

				res.statusCode = 200;
				res.end("200 OK");


				commentData.media = commentData.media ? commentData.media.map((media) => {
					if (typeof media.type == "string" && typeof media.data == "object") {
						return {
							url: `https://leonardo.osnova.io/${media.data.uuid}`,
							size: {
								height: media.data.height,
								width: media.data.width,
								ratio: media.data.width / media.data.height
							}
						}
					} else
						return false;
				}).filter((media) => media) : null;


				const caption = `${
					authorID ?
						`<a href="${
							encodeURI(new URL(`/u/${authorID}`, new URL(link).origin).href)}">${TGE(authorName)
						}</a>`
					:
						`<b>${TGE(authorName)}</b>`
				}\n\n${
					text && text.length ?
						`<i>${TGE(text)}</i>\n\n`
					:
						""
				}<a href="${encodeURI(link)}">${TGE(link)}</a>`;


				GlobalBuildImages([ commentData ])
				.then(([{ buffer }]) => {
					telegram.sendPhoto(specialChatID, {
						source: buffer,
						filename: `comment_halfsize_${commentID}.jpeg`
					}, {
						caption,
						disable_web_page_preview: true,
						parse_mode: "HTML"
					})
					.catch((e) => {
						LogMessageOrError(e);

						telegram.sendMessage(specialChatID, caption).catch(LogMessageOrError);
					})
					.finally(() => {
						telegram.sendDocument(specialChatID, {
							source: buffer,
							filename: `comment_full_${commentID}.jpeg`
						}, {
							disable_web_page_preview: true
						}).catch(LogMessageOrError);
					});
				}).catch(LogMessageOrError);
			} catch (e) {
				return Promise.reject(e);
			};
		}).catch((e) => {
			LogMessageOrError(e);

			res.statusCode = 500;
			res.end("500 Internal Server Error");
			return;
		});
	}).listen(LOCAL_HTTP_BYPASS_SERVER_PORT);
}


const botStartedTime = Date.now();

telegraf.on("text", (ctx) => {
	if (Date.now() - botStartedTime < 5e3) return;


	const {chat, from} = ctx;


	if (chat && chat["type"] === "private") {
		const message = ctx["message"];
		if (!message) return false;

		LogMessageOrError(`Private chat with user ${from.id} (@${from.username || "NO_USERNAME"}) - ${new Date().toISOString()}. Text: ${message["text"]}`);

		const text = message["text"];
		if (!text) return false;



		const commandMatch = text.match(/^\/([\w]+)$/i);

		if (commandMatch && commandMatch[1]) {
			if (typeof COMMANDS[commandMatch[1]] == "string")
				return ctx.reply(COMMANDS[commandMatch[1]], {
					disable_web_page_preview: true,
					parse_mode: "HTML"
				}).catch(LogMessageOrError);
			else if (typeof COMMANDS[commandMatch[1]] == "function")
				return COMMANDS[commandMatch[1]](ctx);
		};

		return false;
	};


	if (DEV) {
		if (CHATS_LIST.reduce((accumulator, chatFromList) => {
			if (chatFromList.id === chat["id"]) ++accumulator;
			return accumulator;
		}, 0) === 0)
			LogMessageOrError("NEW CHAT!", chat["id"], chat["title"], chat["type"]);
	};


	CHATS_LIST.forEach((chatFromList) => {
		if (!chatFromList.enabled) return false;
		if (chatFromList.id !== chat["id"]) return false;

		const message = ctx["message"];
		if (!message) return false;

		const text = message["text"];
		if (!text) return false;



		const commandMatch = text.match(/^\/([\w]+)\@serguun42_osnova_comments_bot$/i);

		if (commandMatch && commandMatch[1]) {
			if (!CheckForCommandAvailability(from)) {
				return false;
			};

			telegram.deleteMessage(chat.id, message.message_id).catch(() => {});

			if (typeof COMMANDS[commandMatch[1]] == "string")
				return ctx.reply(COMMANDS[commandMatch[1]], {
					disable_web_page_preview: true,
					parse_mode: "HTML"
				}).catch(LogMessageOrError);
			else if (typeof COMMANDS[commandMatch[1]] == "function")
				return COMMANDS[commandMatch[1]](ctx);
		};



		GlobalParseMessageForLinksToComments(message)
			.then((commentsID) => GlobalGetComments(commentsID))
			.then((commentsData) => GlobalBuildImages(commentsData))
			.then((commentsImages) => GlobalReplyWithImages(ctx, commentsImages, chatFromList.fullsize))
			.catch((...errors) => {
				if (!(errors && errors[0] && (errors[0].code === "No comments" || errors[0].code === "No URLs in message")))
					LogMessageOrError(...errors);
			});
	});
});

telegraf.launch();

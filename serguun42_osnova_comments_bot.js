const
	fs = require("fs"),
	DEV = require("os").platform() === "win32" || process.argv[2] === "DEV",
	{ createCanvas, loadImage, registerFont } = require("canvas"),
	EmojiRegexp = require("./serguun42_osnova_comments_bot.emoji-regexp"),
	MentionRegexp = {
		global: /\[\@\d+\|[^\]]+\]/g,
		group: /\[\@\d+\|([^\]]+)\]/,
		groupAndGlobal: /\[\@\d+\|([^\]]+)\]/g
	},
	NodeFetch = require("node-fetch"),
	Telegraf = require("telegraf");



registerFont("./fonts/Roboto-Light.ttf", { family: "Roboto", weight: "300" });
registerFont("./fonts/Roboto-Regular.ttf", { family: "Roboto", weight: "400" });
registerFont("./fonts/Roboto-Bold.ttf", { family: "Roboto", weight: "700" });

if (DEV)
	registerFont("./fonts/SegoeUIEmoji.ttf", { family: "Segoe UI Emoji" });
else
	registerFont("./fonts/NotoColorEmoji.ttf", { family: "Noto Color Emoji" });


/**
 * @typedef {Object} PlatformObject
 * @property {String} token
 * @property {String} apiURL
 * @property {String} userAgent
 * 
 * 
 * @typedef {Object} ConfigFile
 * @property {String} TELEGRAM_BOT_TOKEN
 * @property {{ "tjournal.ru": PlatformObject, "dtf.ru": PlatformObject, "vc.ru": PlatformObject }} CMTT_PLATFORMS
 * @property {{id: number, username: string}} ADMIN_TELEGRAM_DATA
 * @property {Array.<{id: number, name?: string, enabled: boolean, fullsize?: boolean}>} CHATS_LIST
 * @property {String[]} COMMANDS_WHITELIST
 * @property {String[] | Number[]} BLACKLIST
 */
/** @type {ConfigFile} */
const
	CONFIG = require("./serguun42_osnova_comments_bot.config.json"),
	{
		TELEGRAM_BOT_TOKEN,
		CMTT_PLATFORMS,
		ADMIN_TELEGRAM_DATA,
		CHATS_LIST,
		COMMANDS_WHITELIST,
		BLACKLIST
	} = CONFIG,
	COMMANDS_USAGE = new Object(),
	COMMANDS = {
		"help": `Что я умею?

Вы добавляете меня в чат – на сообщения с ссылками на комментарий я отвечаю картинками и опционально картинками-документами в высоком разрешении.
В сообщении может быть несколько ссылок на комментарии с разных платформ – TJournal, DTF, VC.

Все вопросы – <a href="https://t.me/${ADMIN_TELEGRAM_DATA.username}">${ADMIN_TELEGRAM_DATA.username}</a>`,
	};



const telegraf = new Telegraf.Telegraf(TELEGRAM_BOT_TOKEN);
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

const EmojiToUnicode = (emoji) => {
	let comp;

	if (emoji.length === 1) {
		comp = emoji.charCodeAt(0);
	};

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
 * @typedef {Object} CommentData
 * @property {String} link
 * @property {Number} commentID
 * @property {String} authorAvatar
 * @property {String} authorName
 * @property {String} likes
 * @property {String} text
 * @property {String} date
 * @property {String} [replyToName]
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
const GlobalCheckMessageForLink = (message) => new Promise((resolve, reject) => {
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
 * @param {ParsedCommentData[]} iComments
 * @returns {Promise<CommentData[], {code: string}>}
 */
const GlobalGetComments = (iComments) => new Promise((gettingResolve, gettingReject) => {
	Promise.all(iComments.map((comment) => {
		/** @type {PlatformObject} */
		const platform = CMTT_PLATFORMS[comment.host];

		if (!platform) return Promise.resolve({ text: null, place: 1 });


		return NodeFetch(`${platform.apiURL}entry/${comment.entryID}/comments/popular`, {
			headers: {
				"X-Device-Token": platform.token,
				"User-agent": platform.userAgent
			},
			method: "GET"
		}).then((res) => {
			if (res.status === 200)
				return res.json();
			else
				return Promise.reject(`${platform.apiURL}entry/${comment.entryID}/comments/popular – ${res.status}`);
		}).then((data) => {
			if (data.text === null) return Promise.resolve({ text: null, place: 2 });


			let {result} = data;
			/** @type {CommentData} */
			let dataToResolve = { text: null, place: 3 };

			if (result instanceof Array)
				result.forEach((commentFromAPI) => {
					if (commentFromAPI.id === comment.commentID) {
						dataToResolve = {
							link: `https://${comment.host}/${comment.entryID}?comment=${comment.commentID}`,
							commentID: comment.commentID,
							authorAvatar: commentFromAPI.author.avatar_url,
							authorName: commentFromAPI.author.name,
							likes: commentFromAPI.likes.summ,
							text: commentFromAPI.text,
							date: commentFromAPI.date * 1e3,
							replyToName: (commentFromAPI.replyTo && !comment.hideReply) ? result.find((commentFromAPIToMatch) => commentFromAPIToMatch.id === commentFromAPI.replyTo) || "" : "",
							...((commentFromAPI.media && commentFromAPI.media.length) ? {
								media: commentFromAPI.media.map(({ imageUrl, size }) => {
									return { url: imageUrl, size };
								}).filter(i => !!i)
							} : {})
						};
					};
				});


			return Promise.resolve(dataToResolve);
		}).catch((e) => {
			LogMessageOrError(e);

			return Promise.resolve({ text: null, place: 4 });
		});
	})).then(/** @param {CommentData[]} commentsData */ (commentsData) => {
		return gettingResolve(
			commentsData
				.filter((commentData) => commentData.text !== null)
		);
	}).catch(gettingReject);
});

/**
 * @param {CommentData[]} iComments
 * @returns {Promise.<{buffer: Buffer, link: string, commentID: number}[], {code: string}>}
 */
const GlobalBuildImages = (iComments) => {
	let PNGsData = new Array(iComments.length).fill(false);

	return new Promise((resolve) => {
		iComments.forEach((commentData, commentIndex) => {
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
			 * @property {Number} leftOffset
			 * @property {Number} width
			 * @property {Number} height
			 * 
			 * @typedef {Object} AdditionalTextMentionEntity
			 * @property {"mention"} type
			 * @property {String} value
			 * @property {Number} offsetLeft
			 * @property {Number} mentionWidth
			 * 
			 * @typedef {AdditionalTextEmojiEntity | AdditionalTextMentionEntity} AdditionalTextEntity
			 * 
			 * @typedef {{type: "simple" | "complex", text: string, additionalEntities?: AdditionalTextEntity[]}[]} GotLinesType
			 */
			/**
			 * 
			 * @param {String} text
			 * @param {Number} maxTextWidth
			 * @param {Number} fontSize
			 * @param {String} [fontWeight="400"]
			 * @returns {GotLinesType}
			 */
			const LocalGetLines = (text, maxTextWidth, fontSize, fontWeight = 400) => {
				const canvasForTest = createCanvas(2000, 100);
				const ctxForTest = canvasForTest.getContext("2d");

				ctxForTest.font = `${fontWeight} ${fontSize}px Roboto`;
				ctxForTest.fillStyle = "#121212";


				/** @type {String[]} */
				const allEmojiesFromMessage = Array.from(text.match(EmojiRegexp.global) || []);
				let emojiIndex = 0;

				text = text.replace(EmojiRegexp.global, "😍");


				const linesSplittedByChar = text.split("\n");

				/**
				 * @typedef {Object} ComplexMiddleLine
				 * @property {String} lineText
				 * @property {AdditionalTextEntity[]} additionalEntities
				 */
				/** @type {ComplexMiddleLine[]} */
				const linesForReturn = [];
				
				let width = 0,
					i, j, result;


				linesSplittedByChar.forEach((lineSplittedByChar) => {
					let lineToCount = lineSplittedByChar,
						offsetFixer = 0;

					/** @type {String[]} */
					const localLines = [];

					/** @type {{value: string, start: number, length: number, lineIndex: number}[]} */
					const mentionsPositions = [];


					if (MentionRegexp.group.test(lineToCount)) {
						lineToCount = lineToCount.replace(MentionRegexp.groupAndGlobal, (triggeredLine, mentionName, offset) => {
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
						for (i = lineToCount.length; ctxForTest.measureText(lineToCount.substr(0, i)).width > maxTextWidth; i--);

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
						})
					});
				});


				return linesForReturn.map((complexMiddleLine) => {
					const { additionalEntities } = complexMiddleLine;
					let { lineText } = complexMiddleLine;


					if (EmojiRegexp.global.test(lineText)) {
						const splittedByEmojies = lineText.split(EmojiRegexp.groupAndGlobal),
							  metrics = [];


						splittedByEmojies.forEach((partOfLine) => {
							const leftOffset = metrics.reduce((accumulator, value) => accumulator + value, 0);

							if (EmojiRegexp.single.test(partOfLine)) {
								if (DEV)
									ctxForTest.font = fontSize + "px Segoe UI Emoji";
								else
									ctxForTest.font = fontSize + "px Noto Color Emoji";


								const currentMetrics = ctxForTest.measureText(partOfLine);

								metrics.push(currentMetrics.width);

								additionalEntities.push({
									type: "emoji",
									value: allEmojiesFromMessage[emojiIndex++],
									leftOffset,
									width: currentMetrics.width,
									height: currentMetrics.actualBoundingBoxAscent + currentMetrics.actualBoundingBoxDescent
								});
							} else {
								ctxForTest.font = `${fontWeight} ${fontSize}px Roboto`;

								metrics.push(ctxForTest.measureText(partOfLine).width);
							};
						});

						lineText = lineText.replace(EmojiRegexp.global, "😀");
					};


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
				linesForRealCanvas = LocalGetLines(commentData.text, 1800, fontSize);
				heightForCanvas += (fontSize * 1.2) * linesForRealCanvas.length + 32;
			};



			/** @type {{url: string, x: number, y: number, width: number, height: number}[]} */
			const imagesToDraw = [];

			/**
			 * @returns {Promise.<"Successfull">}
			 */
			const LocalDrawAllImages = () => new Promise((resolveDrawingImages) => {
				if (!imagesToDraw.length) return resolveDrawingImages("Successfull");

				const drawnImages = imagesToDraw.map(() => false);

				imagesToDraw.forEach((imageToDraw, imageIndex) => {
					loadImage(imageToDraw.url).then((imageReadyData) => {
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
			};



			const canvas = createCanvas(2000, heightForCanvas);
			const ctx = canvas.getContext("2d");

			ctx.fillStyle = "#FFFFFF";
			ctx.fillRect(0, 0, 2000, heightForCanvas);


			if (commentData.text) {
				linesForRealCanvas.forEach((lineForRealCanvas, lineForRealCanvasIndex) => {
					ctx.font = `400 ${fontSize}px Roboto`;
					ctx.fillStyle = commentBodyColor;
					ctx.fillText(lineForRealCanvas.text, 100, 332 + fontSize + (fontSize * 1.2) * lineForRealCanvasIndex);

					if (lineForRealCanvas.type == "complex") {
						lineForRealCanvas.additionalEntities.forEach((additionalEntity) => {
							if (additionalEntity.type == "mention") {
								ctx.fillStyle = "#FFFFFF";
								ctx.fillRect(100 + additionalEntity.offsetLeft, 332 + (fontSize * 1.2) * lineForRealCanvasIndex + 10, additionalEntity.mentionWidth, fontSize * 1.2);


								ctx.font = `400 ${fontSize}px Roboto`;
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
								ctx.fillRect(100 + additionalEntity.leftOffset, 332 + (fontSize * 1.2) * lineForRealCanvasIndex + 10, fontSize + 10, fontSize * 1.2);


								imagesToDraw.push({
									url: `./fonts/png/${EmojiToUnicode(additionalEntity.value)}.png`,
									width: fontSize,
									height: fontSize,
									x: 100 + additionalEntity.leftOffset,
									y: 332 + (fontSize * 1.2) * lineForRealCanvasIndex + 10
								});
							};
						});
					};
				});
			};


			let commentHeadLines = LocalGetLines(commentData.authorName, 1240, headFontSize, "700"),
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
						ctx.fillRect(additionalEntity.leftOffset + 350, headTopPlacing - headFontSize, 110, 110);


						imagesToDraw.push({
							url: `./fonts/png/${EmojiToUnicode(additionalEntity.value)}.png`,
							width: 90,
							height: 90,
							x: additionalEntity.leftOffset + 350,
							y: headTopPlacing - headFontSize
						});
					};
				});
			};

			const diff = 3600e3 * 3,
				  day = 86400e3,
				  months = [
					  "янв",
					  "фев",
					  "мар",
					  "апр",
					  "мая",
					  "июня",
					  "июля",
					  "авг",
					  "сен",
					  "окт",
					  "ноя",
					  "дек"
				  ],
				  dateDiff = Date.now() - commentData.date,
				  dateObject = new Date(commentData.date + diff),
				  isToday = (commentData.date - commentData.date % day) === (Date.now() - Date.now() % day),
				  isYesterday = (commentData.date - commentData.date % day) === (Date.now() - Date.now() % day - day),
				  timeString = `${dateObject.getHours().toString().padStart(2, "0")}:${dateObject.getMinutes().toString().padStart(2, "0")}`,
				  dateString = (isToday
								?
									timeString
								:
									(isYesterday
									?
										`Вчера, ${timeString}`
									:
										(dateDiff < 30 * day
										?
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


			if (commentData.replyToName) {
				const replyToName = typeof commentData.replyToName === "string" ? commentData.replyToName : commentData.replyToName?.author?.name;

				if (replyToName) {
					const dateStringWidth = ctx.measureText(dateString).width,
						  replyToNameLines = LocalGetLines(replyToName, 1000, dateFontSize, "300"),
						  replyToNameText = replyToNameLines[0],
						  offsetForReplyToNameText = 350 + dateStringWidth + 50 + 34 + 16;

					imagesToDraw.push({
						url: "./fonts/reply_icon.png",
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
								ctx.fillRect(additionalEntity.leftOffset + offsetForReplyToNameText - 4, 250 - dateFontSize, dateFontSize * 1.2, dateFontSize * 1.2);


								imagesToDraw.push({
									url: `./fonts/png/${EmojiToUnicode(additionalEntity.value)}.png`,
									width: dateFontSize,
									height: dateFontSize,
									x: additionalEntity.leftOffset + offsetForReplyToNameText,
									y: 250 - dateFontSize + 2
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

			ctx.font = `700 ${headFontSize}px Roboto`;

			const karmaTopPlacing = 215,
				  karmaMetrics = ctx.measureText(commentData.likes),
				  karmaWidth = karmaMetrics.width,
				  karmaHeight = karmaMetrics.actualBoundingBoxAscent + karmaMetrics.actualBoundingBoxDescent;

			ctx.fillStyle = karmaBackgroundColor;
			ctx.fillRect(1900 - karmaWidth - 48 * 2, karmaTopPlacing - headFontSize, karmaWidth + 48 * 2, karmaHeight + 24 * 2);

			ctx.fillStyle = karmaTextColor;
			ctx.font = `700 ${headFontSize}px Roboto`;
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
				PNGsData[commentIndex] = {
					link: commentData.link,
					commentID: commentData.commentID,
					buffer: canvas.toBuffer("image/jpeg", { quality: 1, progressive: true })
				};

				if (PNGsData.reduce((accumulator, current) => {
					if (current === false) accumulator += 1;
					return accumulator;
				}, 0) === 0) {
					return resolve(PNGsData);
				};
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
	TelegramSendToAdmin(`serguun42's Osnova Comments Bot have been spawned at ${new Date().toISOString()} <i>(ISO 8601, UTC)</i>`);





telegraf.on("text", (ctx) => {
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

			telegram.deleteMessage(chat.id, message.message_id).catch(LogMessageOrError);

			if (typeof COMMANDS[commandMatch[1]] == "string")
				return ctx.reply(COMMANDS[commandMatch[1]], {
					disable_web_page_preview: true,
					parse_mode: "HTML"
				}).catch(LogMessageOrError);
			else if (typeof COMMANDS[commandMatch[1]] == "function")
				return COMMANDS[commandMatch[1]](ctx);
		};



		GlobalCheckMessageForLink(message)
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

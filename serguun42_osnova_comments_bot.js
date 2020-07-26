const
	URL = require("url"),
	fs = require("fs"),
	DEV = require("os").platform() === "win32" || process.argv[2] === "DEV",
	L = function(arg) {
		if (DEV) {
			console.log(...arguments);
			if (typeof arg == "object") fs.writeFileSync("./out/errors.json", JSON.stringify(arg, false, "\t"));
		};
	},
	EmojiRegexp = require("./serguun42_osnova_comments_bot.emoji-regexp"),
	NodeFetch = require("node-fetch"),
	Telegraf = require("telegraf"),
	Sessions = require("telegraf/session"),
	Telegram = require("telegraf/telegram");


const { createCanvas, loadImage, registerFont } = require("canvas");



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
 * @property {String} PROXY_URL
 */
/** @type {ConfigFile} */
const
	CONFIG = JSON.parse(fs.readFileSync("./serguun42_osnova_comments_bot.config.json")),
	TELEGRAM_BOT_TOKEN = CONFIG.TELEGRAM_BOT_TOKEN,
	ADMIN_TELEGRAM_DATA = CONFIG.ADMIN_TELEGRAM_DATA,
	CHATS_LIST = CONFIG.CHATS_LIST,
	COMMANDS = {
		"help": `Что я умею?
	
Вы добавляете меня в чат – я отвечаю на сообщения с ссылками на комментарий картинками и картинками-документами в высоком разрешении.
В сообщении может быть несколько ссылок на комментарии с разных платформ – TJournal, DTF, VC.

Все вопросы – <a href="https://t.me/${ADMIN_TELEGRAM_DATA.username}">${ADMIN_TELEGRAM_DATA.username}</a>`,
	};


let telegramConnectionData = {};


if (DEV) {
	const ProxyAgent = require("proxy-agent");

	telegramConnectionData["agent"] = new ProxyAgent(CONFIG.PROXY_URL);
};


const
	telegram = new Telegram(TELEGRAM_BOT_TOKEN, telegramConnectionData),
	TOB = new Telegraf(TELEGRAM_BOT_TOKEN, { telegram: telegramConnectionData });





/**
 * @param {String} iQuery
 * @returns {Object.<string, (string|true)>}
 */
const GlobalParseQuery = iQuery => {
	if (!iQuery) return {};

	let cList = new Object();
		iQuery = iQuery.toString().split("&");

	iQuery.forEach((item)=>{ cList[item.split("=")[0]] = (item.split("=")[1] || true); });

	return cList;
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
 * @typedef {Object} TelegramFromObject
 * @property {Number} id
 * @property {String} first_name
 * @property {String} username
 * @property {Boolean} is_bot
 * @property {String} language_code
 * 
 * @typedef {Object} TelegramChatObject
 * @property {Number} id
 * @property {String} title
 * @property {String} type
 * 
 * @typedef {Object} TelegramPhotoObj
 * @property {String} file_id
 * @property {String} file_unique_id
 * @property {Number} file_size
 * @property {Number} width
 * @property {Number} height
 * 
 * @typedef {Object} TelegramMessageObject
 * @property {Number} message_id
 * @property {String} text
 * @property {TelegramFromObject} from
 * @property {TelegramChatObject} chat
 * @property {Number} date
 * @property {Array.<{offset: Number, length: Number, type: String}>} [entities]
 * @property {TelegramPhotoObj[]} [photo]
 * @property {TelegramMessageObject} [reply_to_message]
 * @property {{inline_keyboard: Array.<Array.<{text: string, callback_data: string, url: string}>>}} [reply_markup]
 * @property {String} [caption]
 * 
 * @typedef {Object} TelegramUpdateObject
 * @property {Number} update_id
 * @property {TelegramMessageObject} message
 * 
 * @typedef {Object} TelegramContext
 * @property {Object} telegram 
 * @property {String} updateType 
 * @property {Object} [updateSubTypes] 
 * @property {TelegramMessageObject} [message] 
 * @property {Object} [editedMessage] 
 * @property {Object} [inlineQuery] 
 * @property {Object} [chosenInlineResult] 
 * @property {Object} [callbackQuery] 
 * @property {Object} [shippingQuery] 
 * @property {Object} [preCheckoutQuery] 
 * @property {Object} [channelPost] 
 * @property {Object} [editedChannelPost] 
 * @property {Object} [poll] 
 * @property {Object} [pollAnswer] 
 * @property {TelegramChatObject} [chat] 
 * @property {TelegramFromObject} [from] 
 * @property {Object} [match] 
 * @property {TelegramUpdateObject} [update] 
 * @property {Boolean} webhookReply
 */
/**
 * @param {String} message
 */
const TelegramSendToAdmin = (message) => {
	if (!message) return;

	telegram.sendMessage(ADMIN_TELEGRAM_DATA.id, message, {
		parse_mode: "HTML",
		disable_notification: true
	}).then(L).catch(L);
};

if (!DEV)
	TelegramSendToAdmin(`serguun42's Osnova Comments Bot have been spawned at ${new Date().toISOString()} <i>(ISO 8601, UTC)</i>`);





TOB.use(Sessions());

TOB.on("text", /** @param {TelegramContext} ctx */ (ctx) => {
	const {chat, from} = ctx;


	if (chat && chat["type"] === "private") {
		const message = ctx["message"];
		if (!message) return false;

		const text = message["text"];
		if (!text) return false;



		let commandMatch = text.match(/^\/([\w]+)(\@serguun42_osnova_comments_bot)?$/i);

		if (commandMatch && commandMatch[1]) {
			telegram.deleteMessage(chat.id, message.message_id).then(L).catch(L);

			L({commandMatch});

			if (typeof COMMANDS[commandMatch[1]] == "string")
				return ctx.reply(COMMANDS[commandMatch[1]], {
					disable_web_page_preview: true,
					parse_mode: "HTML"
				}).then(L).catch(L);
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
			console.log("NEW CHAT!", chat["id"]);
	};


	CHATS_LIST.forEach((chatFromList) => {
		if (!chatFromList.enabled) return false;
		if (chatFromList.id !== chat["id"]) return false;

		const message = ctx["message"];
		if (!message) return false;

		const text = message["text"];
		if (!text) return false;



		let commandMatch = text.match(/^\/([\w]+)(\@serguun42_osnova_comments_bot)?$/i);

		if (commandMatch && commandMatch[1]) {
			telegram.deleteMessage(chat.id, message.message_id).then(L).catch(L);


			L({commandMatch});

			if (typeof COMMANDS[commandMatch[1]] == "string")
				return ctx.reply(COMMANDS[commandMatch[1]], {
					disable_web_page_preview: true,
					parse_mode: "HTML"
				}).then(L).catch(L);
			else if (typeof COMMANDS[commandMatch[1]] == "function")
				return COMMANDS[commandMatch[1]](ctx);
		};



		GlobalCheckMessageForLink(message)
			.then((commentsID) => GlobalGetComments(commentsID))
			.then((commentsData) => GlobalBuildImages(commentsData))
			.then((commentsImages) => GlobalReplyWithImages(ctx, commentsImages, chatFromList.fullsize))
			.catch(L);
	});
});

TOB.launch();





/**
 * @typedef {Object} CommentData
 * @property {String} link
 * @property {Number} commentID
 * @property {String} authorAvatar
 * @property {String} authorName
 * @property {String} likes
 * @property {String} text
 * @property {{url: string, size: {width: number, height: number, ratio: number}}[]} [media]
 */
/**
 * @param {TelegramMessageObject} message
 * @returns {Promise.<Array.<{host: string, entryID: number, commentID: number}>, {code: string}>}
 */
const GlobalCheckMessageForLink = (message) => new Promise((resolve, reject) => {
	if (!message.entities || !message.entities.length) return reject({ code: "No URLs in message" });


	/**
	 * @type {Array.<{host: string, entryID: number, commentID: number}>}
	 */
	let comments = [];


	message.entities.forEach((entity) => {
		if (entity.type === "url") {
			let urlEntityText = message.text.slice(entity.offset, entity.offset + entity.length);

			try {
				let url = URL.parse(urlEntityText),
					{ host, search, pathname } = url;

				if (search && pathname) {
					if (search[0] === "?") search = search.slice(1);

					let queries = GlobalParseQuery(search);

					if (queries["comment"] && parseInt(queries["comment"])) {
						let entryID = 0,
							splitted = pathname.split("/").filter(i => !!i);

						if (parseInt(splitted[0])) entryID = parseInt(splitted[0]);

						if (splitted[0] === "u" || splitted[0] === "s") {
							if (splitted[2] && parseInt(splitted[2])) entryID = parseInt(splitted[2]);
						} else {
							if (splitted[1] && parseInt(splitted[1])) entryID = parseInt(splitted[1]);
						};


						if (entryID) {
							comments.push({
								host,
								entryID: entryID,
								commentID: parseInt(queries["comment"])
							});
						};
					};
				};
			} catch (e) {
				L(e);
			};
		}
	});


	comments = comments.filter((comment, index) => {
		if (!comment.entryID || !comment.commentID) return false;

		return comments.findIndex((commentToFind) => commentToFind.commentID === comment.commentID) === index;
	});


	if (comments.length)
		return resolve(comments);
	else
		return reject({ code: "No comments" });
});

/**
 * @param {Array.<{host: string, entryID: number, commentID: number}>} iComments
 * @returns {Promise.<CommentData[], {code: string}>}
 */
const GlobalGetComments = (iComments) => new Promise((gettingResolve, gettingReject) => {
	L({ where: "GlobalGetComments", what: "list of comments to get data", iComments });
	
	
	Promise.all(iComments.map((comment) => {
		/** @type {PlatformObject} */
		const platform = CONFIG.CMTT_PLATFORMS[comment.host];

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
				return Promise.resolve({ text: null, place: 2 });
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
			L(e);

			return Promise.resolve({ text: null, place: 4 });
		});
	})).then(/** @param {CommentData[]} commentsData */ (commentsData) => {
		return gettingResolve(
			commentsData
				.filter((commentData) => commentData.text !== null)
		);
	}).catch((e) => gettingReject(e));
});

/**
 * @param {CommentData[]} iComments
 * @returns {Promise.<{buffer: Buffer, link: string, commentID: number}[], {code: string}>}
 */
const GlobalBuildImages = (iComments) => {
	L({ where: "GlobalBuildImages", what: "list of comments' data", iComments });


	let PNGsData = new Array(iComments.length).fill(false);

	return new Promise(async (resolve) => {
		iComments.forEach((commentData, commentIndex) => {
			const
				fontSize = commentData.text && commentData.text.length > 100 ? 64 : 84,
				commentBodyColor = "#121212",
				headFontSize = 84,
				commentHeadColor = "#444444";

			let heightForCanvas = 400;



			/**
			 * @typedef {Object} AdditionalTextEntity
			 * @property {"underline"|"emoji"} type
			 * @property {String} value
			 * @property {Number} leftOffset
			 * @property {Number} width
			 * @property {Number} height
			 */
			/**
			 * 
			 * @param {String} text
			 * @param {Number} maxTextWidth
			 * @param {Number} fontSize
			 * @param {String} [fontWeight="400"]
			 * @returns {Array.<{type: "simple" | "complex", text: string, additionalEntities?: AdditionalTextEntity[]}>}
			 */
			const LocalGetLines = (text, maxTextWidth, fontSize, fontWeight = 400) => {
				let lines = [],
					linesForReturn = [],
					width = 0,
					i, j, result;

				const canvasForTest = createCanvas(2000, 100);
				const ctxForTest = canvasForTest.getContext("2d");

				ctxForTest.font = `${fontWeight} ${fontSize}px Roboto`;
				ctxForTest.fillStyle = "#121212";


				/** @type {String[]} */
				let emojies = Array.from(text.match(EmojiRegexp.global) || []),
					emojiIndex = 0;


				text = text.replace(EmojiRegexp.global, "😀");


				// Start calculation
				while (text.length) {
					for (i = text.length; ctxForTest.measureText(text.substr(0, i)).width > maxTextWidth; i--);

					result = text.substr(0, i);

					if (i !== text.length)
						for (j = 0; result.indexOf(" ", j) !== -1; j = result.indexOf(" ", j) + 1);

					lines.push(result.substr(0, j || result.length));
					width = Math.max(width, ctxForTest.measureText(lines[lines.length - 1]).width);
					text = text.substr(lines[lines.length - 1].length, text.length);
				};


				lines.forEach((line) => {
					if (!(/\n/g.test(line)))
						return linesForReturn.push(line);

					line.split("\n").forEach((newSubLine) => linesForReturn.push(newSubLine));
				});


				linesForReturn = linesForReturn.map((line) => {
					/** @type {AdditionalTextEntity[]} */
					let additionalEntities = [];


					if (EmojiRegexp.global.test(line)) {
						let splittedByEmojies = line.split(EmojiRegexp.groupAndGlobal),
							metrics = [];


						splittedByEmojies.forEach((partOfLine) => {
							let leftOffset = metrics.reduce((accumulator, value) => accumulator + value, 0);
							
							if (EmojiRegexp.single.test(partOfLine)) {
								if (DEV)
									ctxForTest.font = fontSize + "px Segoe UI Emoji";
								else
									ctxForTest.font = fontSize + "px Noto Color Emoji";


								let currentMetrics = ctxForTest.measureText(partOfLine);

								metrics.push(currentMetrics.width);


								additionalEntities.push({
									type: "emoji",
									value: emojies[emojiIndex++],
									leftOffset,
									width: currentMetrics.width,
									height: currentMetrics.actualBoundingBoxAscent + currentMetrics.actualBoundingBoxDescent
								});
							} else {
								ctxForTest.font = `${fontWeight} ${fontSize}px Roboto`;

								metrics.push(ctxForTest.measureText(partOfLine).width);
							};
						});
					};


					if (additionalEntities.length)
						return { type: "complex", text: line.replace(EmojiRegexp.global, "😀"), additionalEntities };
					else
						return { type: "simple", text: line };
				});


				return linesForReturn;
			};




			let linesForRealCanvas = [];


			/** Text calculation */
			if (commentData.text) {
				linesForRealCanvas = LocalGetLines(commentData.text, 1800, fontSize);
				heightForCanvas += (fontSize * 1.2) * linesForRealCanvas.length + 32;
			};



			/** @type {{url: string, x: number, y: number, width: number, height: number}[]} */
			let imagesToDraw = [];
			
			/**
			 * @returns {Promise.<"Successfull">}
			 */
			let LocalDrawAllImages = () => new Promise((resolveDrawingImages) => {
				if (!imagesToDraw.length) return resolveDrawingImages("Successfull");

				let doneImages = imagesToDraw.map(i => false);

				imagesToDraw.forEach((imageToDraw, imageIndex) => {
					loadImage(imageToDraw.url).then((imageReadyData) => {
						ctx.drawImage(imageReadyData, imageToDraw.x, imageToDraw.y, imageToDraw.width, imageToDraw.height);

						doneImages[imageIndex] = true;

						if (doneImages.reduce((accumulator, current) => {
							if (current === false) accumulator += 1;
							return accumulator;
						}, 0) === 0) {
							L({ where: "LocalDrawAllImages", what: "Done drawing images" });
							return resolveDrawingImages("Successfull");
						};
					}).catch(() => {
						doneImages[imageIndex] = true;

						if (doneImages.reduce((accumulator, current) => {
							if (current === false) accumulator += 1;
							return accumulator;
						}, 0) === 0) {
							L({ where: "LocalDrawAllImages", what: "Done drawing images" });
							return resolveDrawingImages("Successfull");
						};
					});
				});
			});

			/** Media calculation */
			if (commentData.media && commentData.media.length) {
				L({ where: "GlobalBuildImages", what: "commentData.media", media: commentData.media });

				commentData.media.forEach((media) => {
					if (media.size.ratio < 1) {
						let heightForImage = 700;

						if (media.size.height < 700) heightForImage = media.size.height;

						let widthForImage = heightForImage * media.size.ratio,
							marginLeft = (1800 - widthForImage) / 2;


						imagesToDraw.push({
							url: media.url,
							x: 100 + marginLeft,
							y: heightForCanvas - 100 + 64,
							height: heightForImage,
							width: widthForImage
						});

						heightForCanvas += heightForImage + 64;
					} else {
						let widthForImage = 1800,
							marginLeft = 0;

						if (media.size.width < 1800) {
							widthForImage = media.size.width;
							marginLeft = (1800 - widthForImage) / 2;
						};

						let heightForImage = widthForImage / media.size.ratio;


						imagesToDraw.push({
							url: media.url,
							x: 100 + marginLeft,
							y: heightForCanvas - 100 + 64,
							height: heightForImage,
							width: widthForImage
						});

						heightForCanvas += heightForImage + 64;
					};
				});
			};




			const canvas = createCanvas(2000, heightForCanvas);
			const ctx = canvas.getContext("2d");



			ctx.fillStyle = "#FFFFFF";
			ctx.fillRect(0, 0, 2000, heightForCanvas);



			if (commentData.text) {
				for (i = 0, j = linesForRealCanvas.length; i < j; ++i) {
					if (linesForRealCanvas[i].type == "simple") {
						ctx.font = "400 " + fontSize + "px Roboto";
						ctx.fillStyle = commentBodyColor;
						ctx.fillText(linesForRealCanvas[i].text, 100, 332 + fontSize + (fontSize * 1.2) * i);
					} else if (linesForRealCanvas[i].type == "complex") {
						ctx.font = "400 " + fontSize + "px Roboto";
						ctx.fillStyle = commentBodyColor;
						ctx.fillText(linesForRealCanvas[i].text, 100, 332 + fontSize + (fontSize * 1.2) * i);

						linesForRealCanvas[i].additionalEntities.forEach((additionalEntity, entityIndex) => {
							if (additionalEntity.type == "emoji") {
								ctx.fillStyle = "#FFFFFF";
								ctx.fillRect(100 + additionalEntity.leftOffset + 12, 332 + (fontSize * 1.2) * i + 10, fontSize, fontSize);


								imagesToDraw.push({
									url: `./fonts/png/${EmojiToUnicode(additionalEntity.value)}.png`,
									width: fontSize,
									height: fontSize,
									x: 100 + additionalEntity.leftOffset + 12,
									y: 332 + (fontSize * 1.2) * i + 10
								});
							};
						});
					};
				};
			};





			let commentHeadLines = LocalGetLines(commentData.authorName, 1200, headFontSize, "700"),
				commentHeadText = commentHeadLines[0];

			if (commentHeadLines[1]) commentHeadText.text += "…";


			const headTopPlacing = 216;


			if (commentHeadText.type == "simple") {
				ctx.font = "700 " + headFontSize + "px Roboto";
				ctx.fillStyle = commentHeadColor;
				ctx.fillText(commentHeadText.text, 350, headTopPlacing);
			} else if (commentHeadText.type == "complex") {
				ctx.font = "700 " + headFontSize + "px Roboto";
				ctx.fillStyle = commentHeadColor;
				ctx.fillText(commentHeadText.text, 350, headTopPlacing);


				commentHeadText.additionalEntities.forEach((additionalEntity, entityIndex) => {
					if (additionalEntity.type == "emoji") {
						ctx.fillStyle = "#FFFFFF";
						ctx.fillRect(additionalEntity.leftOffset + 350 + entityIndex * 26, headTopPlacing - headFontSize, 110, 110);


						imagesToDraw.push({
							url: `./fonts/png/${EmojiToUnicode(additionalEntity.value)}.png`,
							width: 110,
							height: 110,
							x: additionalEntity.leftOffset + 350 + entityIndex * 26,
							y: headTopPlacing - headFontSize
						});
					};
				});
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

			let karmaMetrics = ctx.measureText(commentData.likes),
				karmaWidth = karmaMetrics.width,
				karmaHeight = karmaMetrics.actualBoundingBoxAscent + karmaMetrics.actualBoundingBoxDescent;

			ctx.fillStyle = karmaBackgroundColor;
			ctx.fillRect(1900 - karmaWidth - 48 * 2, headTopPlacing - headFontSize, karmaWidth + 48 * 2, karmaHeight + 24 * 2);

			ctx.fillStyle = karmaTextColor;
			ctx.font = "700 " + headFontSize + "px Roboto";
			ctx.fillText(commentData.likes, 1900 - karmaWidth - 48, headTopPlacing);



			let userAvatarUrl = commentData.authorAvatar;
			
			try {
				let userAvatarUrlObject = URL.parse(userAvatarUrl);

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
					buffer: canvas.toBuffer("image/jpeg", { quality: 0.85 })
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
 * @param {TelegramContext} ctx
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
			caption: fullsize ? `<a href="${encodeURI(screenData.link)}">${TGE(screenData.link)}</a>` : "",
			disable_web_page_preview: true,
			parse_mode: "HTML",
			reply_to_message_id: ctx.message.message_id
		}).then(() => {
			if (fullsize) {
				ctx.replyWithDocument({
					source: screenData.buffer,
					filename: `comment_full_${screenData.commentID}.jpeg`
				}, {
					disable_web_page_preview: true,
					reply_to_message_id: ctx.message.message_id
				}).then(() => {}).catch(console.warn);
			};
		}).catch(console.warn);
	});
};

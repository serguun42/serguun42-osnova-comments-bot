const
	DEV = require("os").platform() === "win32" || process.argv[2] === "DEV",
	Telegraf = require("telegraf");

const
	CONFIG = DEV ? require("../serguun42_osnova_comments_bot.config.mine.json") : require("../serguun42_osnova_comments_bot.config.json"),
	{
		TELEGRAM_BOT_TOKEN
	} = CONFIG;



const telegraf = new Telegraf.Telegraf(TELEGRAM_BOT_TOKEN);
const telegram = telegraf.telegram;



telegram.logOut()
	.then((success) => console.log(`Logout success: ${success}`))
	.catch(console.warn);

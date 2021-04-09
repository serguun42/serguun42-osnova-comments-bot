# serguun42-osnova-comments-bot
Telegram бот. В общем чате в ответ на сообщения с ссылками на комменты с TJournal, DTF и VC отвечает картинками в высоком разрешении с текстом, автором, кармой и аттачами.


## Использующиеся модули


Модули, которые использует `serguun42_osnova_comments_bot.js` (можете установить их через `npm`, `yarn`, etc.):
* `telegraf`
* `node-fetch`
* `canvas`


## Config

* `LOCAL_SERVER_PORT` – порт локального сервера [Telegram Bot API](https://github.com/tdlib/telegram-bot-api). `0`/`null` – для использования _Cloud_-сервера
* `LOCAL_HTTP_BYPASS_SERVER_PORT` – порт локального HTTP-сервера – другого источника для создания комментов. Может быть использован вместе с сообщениями из настроенных Telegram-каналов либо вместо них. `0`/`null` – для отключения такого сервера.
* `DUMPING_FOLDER` – укажите непустую строку, чтобы указать папку для сброса JPEG-файлов перед отправкой.


## Commands

* `npm install`
* `npm run start_bot`


## Fonts – by Google
[Download Page](https://fonts.google.com/specimen/Roboto)<br>
[Fonts Lisence](http://www.apache.org/licenses/LICENSE-2.0)

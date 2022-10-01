/* eslint-disable no-console */
import { Telegraf } from 'telegraf';
import LoadConfig from '../util/load-config.js';

const { TELEGRAM_BOT_TOKEN } = LoadConfig();

const telegraf = new Telegraf(TELEGRAM_BOT_TOKEN);
const { telegram } = telegraf;

telegram
  .close()
  .then((success) => console.log(`Close success: ${success}`))
  .catch(console.warn);

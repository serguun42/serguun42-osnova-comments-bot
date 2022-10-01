import LoadConfig from './load-config.js';

const { PRIVILEGE_LIST, BLACKLIST } = LoadConfig();

const commandsUsage = {};
/**
 * @param {import("telegraf/typings/core/types/typegram").User} from
 * @returns {boolean}
 */
const CheckForCommandAvailability = (from) => {
  if (PRIVILEGE_LIST.includes(from.username)) return true;

  if (BLACKLIST.includes(from.username) || BLACKLIST.includes(from.id)) return false;

  const lastTimeCalled = commandsUsage[from.id];
  commandsUsage[from.id] = Date.now();

  if (!lastTimeCalled || typeof lastTimeCalled === 'undefined') return true;
  if (Date.now() - lastTimeCalled > 15 * 60 * 1e3) return true;

  return false;
};

export default CheckForCommandAvailability;

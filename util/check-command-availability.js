import LoadConfig from './load-config.js';

const { PRIVILEGE_LIST, BLACKLIST } = LoadConfig();

/** @type {{ [userId: number]: number }} */
const commandsUsage = {};

/**
 * True if can execute command, false if blocked
 *
 * @param {import('../types/telegraf').DefaultFrom} from
 * @returns {boolean}
 */
const CheckCommandAvailability = (from) => {
  if (PRIVILEGE_LIST.includes(from.username)) return true;
  if (BLACKLIST.includes(from.username) || BLACKLIST.includes(from.id)) return false;

  if (!commandsUsage[from.id]) commandsUsage[from.id] = 1;
  else ++commandsUsage[from.id];

  setTimeout(() => --commandsUsage[from.id], 1000 * 60 * 10);

  if (commandsUsage[from.id] > 2) return false;
  return true;
};

export default CheckCommandAvailability;

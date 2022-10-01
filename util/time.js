export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июня', 'июля', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export const UNIX_TIME_CONVERSION_RATE = 1000;

/**
 * @param {string | number | Date} date
 * @returns {number}
 */
export const FromUnixTimestamp = (date) => {
  if (date instanceof Date) return date.getTime();

  if (typeof date === 'string') {
    try {
      return new Date(date).getTime();
    } catch (e) {
      return Date.now();
    }
  }

  if (typeof date === 'number') return date * UNIX_TIME_CONVERSION_RATE;

  return Date.now();
};

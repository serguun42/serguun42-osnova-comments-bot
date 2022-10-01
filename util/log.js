/* eslint-disable no-console */
import fs from 'node:fs/promises';

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * @param  {(string | Error)[]} args
 * @returns {void}
 */
const LogMessageOrError = (...args) => {
  const containsAnyError = args.some((message) => message instanceof Error);
  const out = containsAnyError ? console.error : console.log;

  out(new Date());
  args.forEach((message) => out(message));
  out('~~~~~~~~~~~\n');

  if (IS_DEV) fs.writeFile('./out/logmessageorerror.json', JSON.stringify([...args], false, '\t')).catch(console.warn);
};

export default LogMessageOrError;

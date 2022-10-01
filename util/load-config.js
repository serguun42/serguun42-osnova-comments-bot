import fs from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import LogMessageOrError from './log.js';

const IS_DEV = process.env.NODE_ENV === 'development';

/** Caching read raw JSON */
let localRawJSON = '';

/** @returns {import('../types/config').Config} */
const LoadConfig = () => {
  const configFilePath = join(process.cwd(), 'config', `config.${IS_DEV ? 'dev.' : ''}json`);

  try {
    const rawJson = localRawJSON || fs.readFileSync(configFilePath).toString();
    const parsedConfig = JSON.parse(rawJson);
    localRawJSON = rawJson;
    return parsedConfig;
  } catch (e) {
    LogMessageOrError(e);
    return {};
  }
};

export default LoadConfig;

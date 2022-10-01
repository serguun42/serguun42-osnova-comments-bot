/* eslint-disable no-empty */
import LoadConfig from './load-config.js';

const { CDN_DOMAIN } = LoadConfig();

/**
 * @param {string | URL} urlLike
 * @returns {URL}
 */
export default function SafeURL(urlLike) {
  if (urlLike instanceof URL) return urlLike;
  if (!urlLike || typeof urlLike !== 'string') return new URL(CDN_DOMAIN);

  try {
    const url = new URL(urlLike);
    url.pathname = url.pathname.replace(/\/+/g, '/');
    return url;
  } catch (e) {}

  try {
    const url = new URL(urlLike, CDN_DOMAIN);
    url.pathname = url.pathname.replace(/\/+/g, '/');
    return url;
  } catch (e) {}

  return new URL(CDN_DOMAIN);
}

export type ChatConfig = {
  id: number;
  name: string;
  enabled: boolean;
  /** Whether to send fullsize, not trimmed image (as document, without compression) in addition to usual one */
  fullsize: boolean;
  /** This marks the chat where the comments from local HTTP server are going to. */
  special?: boolean;
};

export type Config = {
  TELEGRAM_BOT_TOKEN: string;

  /** List of chat: enabled, disabled, special, etc. */
  CHATS_LIST: ChatConfig[];

  /** Usernames and IDs of Telegram users who are privileged (no cooldown) */
  PRIVILEGE_LIST: (string | number)[];
  /** Usernames and IDs of Telegram users who are blacklisted */
  BLACKLIST: (string | number)[];

  /**
   * All supported Osnova sites
   * 
   * @example `{ "tjournal.ru": { "token": "…", "apiURL": "https://api.tjournal.ru/v1.8/", "…" } }`
   */
  CMTT_PLATFORMS: {
    [platformDomain: string]: {
      token: string;
      apiURL: string;
      userAgent: string;
    };
  };
  /** `leonardo.osnova.io` */
  CDN_DOMAIN: string;
  /** Header for CDN */
  HEADERS_FOR_FETCHING: string;

  /** Port of Telegram Bot API local server. Set `0` to connect to Telegram servers directly */
  LOCAL_SERVER_PORT: string;
  /** Port for local HTTP-server – handling another source for creating comments. Can be used along with source from Telegram groups. Set `0` to disable this server. */
  LOCAL_HTTP_BYPASS_SERVER_PORT: string;
  /** If not empty, every image will be written there before sending. */
  DUMPING_FOLDER: string;
};

export default Config;

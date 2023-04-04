export type AdditionalTextEmojiEntity = {
  type: 'emoji';
  value: string;
  offsetLeft: number;
  width: number;
  height: number;
};

export type AdditionalTextMentionEntity = {
  type: 'mention';
  value: string;
  offsetLeft: number;
  mentionWidth: number;
};

export type AdditionalTextVerifiedEntity = {
  type: 'verified';
  offsetLeft: number;
  verifiedSize: number;
};

export type AdditionalTextEntity =
  | AdditionalTextEmojiEntity
  | AdditionalTextMentionEntity
  | AdditionalTextVerifiedEntity;

export type GotLines = {
  type: 'simple' | 'complex';
  text: string;
  additionalEntities?: AdditionalTextEntity[] | undefined;
}[];

export type ComplexMiddleLine = {
  lineText: string;
  additionalEntities: AdditionalTextEntity[];
};

export type RemoteImageToDraw = {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  round: boolean;
};

export type LocalImageToDraw = {
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  round: boolean;
};

export type ImageToDraw = RemoteImageToDraw | LocalImageToDraw;

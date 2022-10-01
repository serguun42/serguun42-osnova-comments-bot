export interface CommentAuthor {
  id: number;
  name: string;
  avatar_url: string;
  type: number;
  is_verified: boolean;
  is_online: boolean;
  online_status_text: string;
}

export interface CommentLikes {
  is_liked: number;
  count: number;
  summ: number;
}

export interface CommentMedium {
  type: number;
  imageUrl: string;
  additionalData: {
    type: string;
    url: string;
    hasAudio: boolean;
  };
  size: {
    width: number;
    height: number;
    ratio: number;
  };
}

export type CommentAttachTypeMedia = import('./media').Media;

export type CommentAttachTypeVideo = import('./media').Video;

export type CommentAttachTypeTweet = {
  type: 'tweet';
  data: any;
};

export type CommentAttachTypeTelegram = {
  type: 'telegram';
  data: any;
};

export type CommentAttachTypeLink = {
  type: 'link';
  data: {
    url: string;
    title: string;
    description: string;
    image?: import('./media').Media;
    v: 1;
  };
};

export type CommentAttachTypeDefault = {
  type: 'default';
  data: {};
};

export type CommentAttach =
  | CommentAttachTypeMedia
  | CommentAttachTypeVideo
  | CommentAttachTypeTweet
  | CommentAttachTypeTelegram
  | CommentAttachTypeLink
  | CommentAttachTypeDefault;

export interface CommentFromAPI {
  id: number;
  author: CommentAuthor;
  date: number;
  dateRFC: string;
  isFavorited: boolean;
  date_favorite?: any;
  isEdited: boolean;
  likes: CommentLikes;
  media: CommentMedium[];
  level: number;
  is_pinned: boolean;
  is_ignored: boolean;
  is_removed: boolean;
  replyTo: number;
  text: string;
  text_wo_md: string;
  html: string;
  attaches: CommentAttach[];
  source_id: number;
  entry?: any;
  highlight: string;
  donate?: { count: number };
}

export default CommentFromAPI;

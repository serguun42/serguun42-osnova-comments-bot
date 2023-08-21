export type CommentToBuild = import('./comment-from-api').Comment & {
  link: string;
  postID: number;
  hideReply: boolean;
  allComments: import('./comment-from-api').Comment[];
};

export default CommentToBuild;

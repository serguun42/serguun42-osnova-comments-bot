export type CommentToBuild = import('./comment-from-api').CommentFromAPI & {
  link: string;
  postID: number;
  allComments: import('./comment-from-api').CommentFromAPI[];
};

export default CommentToBuild;

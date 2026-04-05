import type { ForumComment, ForumCommentInput } from "@/forum/types/comment";
import { forumRequest } from "./client";

interface RawCommentRecord {
	id: string | number;
	post_id?: string | number;
	parent_id?: string | number | null;
	author_id?: string | number;
	user_id?: string | number;
	content?: string;
	username?: string;
	avatar_url?: string | null;
	role?: string;
	like_count?: number;
	liked?: boolean;
	created_at?: string;
	updated_at?: string;
	is_pinned?: number;
}

interface CommentLikeResult {
	liked: boolean;
	likeCount?: number;
	like_count?: number;
}

export type CommentSortBy = "likes" | "time";
export type CommentSortDir = "asc" | "desc";

export interface CommentListQuery {
	sortBy?: CommentSortBy;
	sortDir?: CommentSortDir;
}

function normalizeComment(comment: RawCommentRecord): ForumComment {
	return {
		id: String(comment.id),
		postId: comment.post_id !== undefined ? String(comment.post_id) : "",
		parentId:
			comment.parent_id !== undefined && comment.parent_id !== null
				? String(comment.parent_id)
				: null,
		content: comment.content || "",
		author:
			comment.username ||
			comment.avatar_url ||
			comment.author_id !== undefined ||
			comment.user_id !== undefined
				? {
						id:
							comment.author_id !== undefined
								? String(comment.author_id)
								: comment.user_id !== undefined
									? String(comment.user_id)
									: "",
						username: comment.username || "匿名用户",
						displayName: comment.username || "匿名用户",
						avatarUrl: comment.avatar_url || undefined,
						role: comment.role,
					}
				: null,
		likeCount: comment.like_count,
		liked: comment.liked,
		createdAt: comment.created_at,
		updatedAt: comment.updated_at,
		isPinned: Boolean(comment.is_pinned),
	};
}

export async function getComments(
	postId: string,
	query: CommentListQuery = {},
): Promise<ForumComment[]> {
	const result = await forumRequest<RawCommentRecord[]>(
		`/api/posts/${postId}/comments`,
		{
			query: {
				sort_by: query.sortBy,
				sort_dir: query.sortDir,
			},
		},
	);
	return result.map(normalizeComment);
}

export async function createComment(payload: ForumCommentInput): Promise<ForumComment> {
	const result = await forumRequest<RawCommentRecord>(
		`/api/posts/${payload.postId}/comments`,
		{
			method: "POST",
			requiresAuth: true,
			json: {
				content: payload.content,
				parent_id: payload.parentId,
				"cf-turnstile-response": payload.turnstileToken,
			},
		},
	);
	return normalizeComment(result);
}

export function deleteComment(commentId: string): Promise<{ success: boolean }> {
	return forumRequest<{ success: boolean }>(`/api/comments/${commentId}`, {
		method: "DELETE",
		requiresAuth: true,
	});
}

export async function likeComment(commentId: string): Promise<{ liked: boolean; likeCount?: number }> {
	const result = await forumRequest<CommentLikeResult>(
		`/api/comments/${commentId}/like`,
		{
			method: "POST",
			requiresAuth: true,
		},
	);
	return {
		liked: Boolean(result.liked),
		likeCount:
			typeof result.likeCount === "number"
				? result.likeCount
				: result.like_count,
	};
}

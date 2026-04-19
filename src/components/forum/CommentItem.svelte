<script lang="ts">
import ForumMarkdownContent from "@/components/forum/ForumMarkdownContent.svelte";
import { deleteComment, likeComment } from "@/forum/api/comments";
import type { ForumComment } from "@/forum/types/comment";
import type { ForumUser } from "@/forum/types/user";
import { formatForumDateTime } from "@/utils/date-utils";
import Icon from "@components/IconSvelte.svelte";

export let comment: ForumComment;
export let activeReplyParentId: string | null = null;
export let canReply = false;
export let depth = 0;
export let onReplyToggle: (commentId: string | null) => void;
export let onReplyContentChange: (value: string) => void;
export let onReplySubmit: (comment: ForumComment) => void;
export let onReplyEscape: () => void;
export let onCommentPatched: (
	commentId: string,
	patch: Partial<ForumComment>,
) => void;
export let currentUser: ForumUser | null = null;
export let onCommentDeleted: () => void = () => {};

function indentClass(level: number) {
	return level > 0 ? "ml-4 border-l border-white/8 pl-4 md:ml-6 md:pl-5" : "";
}

let likeBusy = false;
let deleteBusy = false;

function navigateTo(url: string) {
	if (typeof window === "undefined") {
		return;
	}
	window.location.href = url;
}

function goToUser(userId?: string) {
	if (!userId) {
		return;
	}
	navigateTo(`/forum/u/?id=${encodeURIComponent(userId)}`);
}

function normalizeRole(role?: string) {
	if (!role) {
		return "";
	}
	const normalizedRole = role.trim().toLowerCase();
	return [
		"admin",
		"administrator",
		"root",
		"superadmin",
		"super_admin",
	].includes(normalizedRole)
		? "admin"
		: normalizedRole;
}

$: canDeleteComment = Boolean(
	currentUser &&
		(normalizeRole(currentUser.role) === "admin" ||
			Boolean(comment.author?.id && currentUser.id === comment.author.id)),
);

async function handleDelete() {
	if (!canDeleteComment || deleteBusy) return;
	if (
		typeof window !== "undefined" &&
		!window.confirm("确定要删除这条评论吗？删除后不可恢复。")
	) {
		return;
	}
	deleteBusy = true;
	try {
		await deleteComment(comment.id);
		onCommentDeleted();
	} catch (error) {
		console.error(error);
	} finally {
		deleteBusy = false;
	}
}

async function toggleLike() {
	if (likeBusy) return;
	likeBusy = true;
	try {
		const previousLiked = Boolean(comment.liked);
		const previousLikeCount = comment.likeCount ?? 0;
		const result = await likeComment(comment.id);
		const nextLiked = Boolean(result.liked);
		const nextLikeCount =
			typeof result.likeCount === "number"
				? result.likeCount
				: Math.max(
						0,
						previousLikeCount +
							(nextLiked === previousLiked ? 0 : nextLiked ? 1 : -1),
					);
		onCommentPatched(comment.id, {
			liked: nextLiked,
			likeCount: nextLikeCount,
		});
	} catch (error) {
		console.error(error);
	} finally {
		likeBusy = false;
	}
}
</script>

<div class={`space-y-3 ${indentClass(depth)}`}>
	<div class="card-base border border-white/10 p-4">
		<div class="mb-3 flex items-start justify-between gap-3">
			<div class="flex items-center gap-3">
				{#if comment.author?.id}
					<button class="flex items-center gap-3 rounded-xl text-left transition hover:text-[var(--primary)]" type="button" on:click={() => goToUser(comment.author?.id)}>
						{#if comment.author?.avatarUrl}
							<img src={comment.author.avatarUrl} alt={comment.author.displayName || comment.author.username || "用户头像"} class="h-9 w-9 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
						{:else}
							<span class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/45">
								<Icon icon="material-symbols:person-outline-rounded" />
							</span>
						{/if}
						<div>
							<div class="text-sm font-medium text-white/75">{comment.author?.displayName || comment.author?.username || "匿名用户"}</div>
							<div class="text-xs text-white/35">{formatForumDateTime(comment.updatedAt || comment.createdAt)}</div>
						</div>
					</button>
				{:else}
					{#if comment.author?.avatarUrl}
						<img src={comment.author.avatarUrl} alt={comment.author.displayName || comment.author.username || "用户头像"} class="h-9 w-9 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
					{:else}
						<span class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/45">
							<Icon icon="material-symbols:person-outline-rounded" />
						</span>
					{/if}
					<div>
						<div class="text-sm font-medium text-white/75">{comment.author?.displayName || comment.author?.username || "匿名用户"}</div>
						<div class="text-xs text-white/35">{formatForumDateTime(comment.updatedAt || comment.createdAt)}</div>
					</div>
				{/if}
			</div>
			{#if comment.isPinned}
				<span class="inline-flex items-center gap-1 rounded-lg border border-[var(--primary)] bg-[var(--primary)]/12 px-2.5 py-1 text-xs font-medium text-[var(--primary)]" title="置顶评论" aria-label="置顶评论">
					<Icon icon="material-symbols:keep-rounded" />
					<span>置顶</span>
				</span>
			{/if}
		</div>

		<ForumMarkdownContent content={comment.content} className="text-sm" />

		<div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/35">
			<button class="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-white/55 transition hover:border-white/20 hover:text-[var(--primary)] disabled:opacity-60" disabled={likeBusy} on:click={toggleLike}>
				<Icon icon={comment.liked ? "material-symbols:favorite-rounded" : "material-symbols:favorite-outline-rounded"} class={comment.liked ? "text-[var(--primary)]" : ""} />
				<span>{comment.likeCount || 0} 赞</span>
			</button>
			{#if canReply}
				<button class="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-white/55 transition hover:border-white/20 hover:text-[var(--primary)]" on:click={() => onReplyToggle(activeReplyParentId === comment.id ? null : comment.id)}>
					<Icon icon="material-symbols:reply-rounded" />
					<span>{activeReplyParentId === comment.id ? "收起回复" : "回复"}</span>
				</button>
			{/if}
			{#if canDeleteComment}
				<button class="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-white/55 transition hover:border-white/20 hover:text-red-300 disabled:opacity-60" disabled={deleteBusy} on:click={handleDelete}>
					<Icon icon="material-symbols:delete-outline-rounded" />
					<span>{deleteBusy ? "删除中" : "删除"}</span>
				</button>
			{/if}
		</div>
	</div>

	{#if canReply && activeReplyParentId === comment.id}
		<div class="card-base border border-white/10 p-4">
			<slot name="reply-editor" />
		</div>
	{/if}

	{#if comment.replies?.length}
		<div class="space-y-3">
			{#each comment.replies as reply (reply.id)}
				<svelte:self
					comment={reply}
					{activeReplyParentId}
					{canReply}
					depth={depth + 1}
					{onReplyToggle}
					{onReplyContentChange}
					{onReplySubmit}
					{onReplyEscape}
					{onCommentPatched}
					{currentUser}
					onCommentDeleted={onCommentDeleted}
				>
					<div slot="reply-editor">
						<slot name="reply-editor" />
					</div>
				</svelte:self>
			{/each}
		</div>
	{/if}
</div>

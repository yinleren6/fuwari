<script lang="ts">
import CommentItem from "@/components/forum/CommentItem.svelte";
import ForumMarkdownEditor from "@/components/forum/ForumMarkdownEditor.svelte";
import type { ForumComment } from "@/forum/types/comment";
import Icon from "@components/IconSvelte.svelte";

export let comments: ForumComment[] = [];
export let loading = false;
export let canReply = false;
export let postId = "";
export let activeReplyParentId: string | null = null;
export let replyContent = "";
export let submittingReply = false;
export let onReplyToggle: (commentId: string | null) => void = () => {};
export let onReplyContentChange: (value: string) => void = () => {};
export let onReplySubmit: (comment: ForumComment) => void = () => {};
export let onReplyEscape: () => void = () => {};
export let onCommentPatched: (
	commentId: string,
	patch: Partial<ForumComment>,
) => void = () => {};
export let currentUser: import("@/forum/types/user").ForumUser | null = null;
export let onCommentDeleted: () => void = () => {};
export let commentSort = "hot";
export let commentSortOptions: Array<{ value: string; label: string }> = [];
export let onSortChange: (value: string) => void = () => {};

function compareCommentsByCreatedAtAsc(a: ForumComment, b: ForumComment) {
	const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
	const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
	const createdAtDiff = aTime - bTime;
	if (createdAtDiff !== 0) {
		return createdAtDiff;
	}

	return a.id.localeCompare(b.id);
}

function sortRepliesByCreatedAt(comment: ForumComment) {
	if (!comment.replies?.length) {
		return;
	}

	comment.replies = [...comment.replies].sort(compareCommentsByCreatedAtAsc);
	for (const reply of comment.replies) {
		sortRepliesByCreatedAt(reply);
	}
}

function buildCommentTree(flatComments: ForumComment[]) {
	const map = new Map<string, ForumComment>();
	const roots: ForumComment[] = [];

	for (const comment of flatComments) {
		map.set(comment.id, { ...comment, replies: [] });
	}

	for (const comment of map.values()) {
		if (comment.parentId) {
			const parent = map.get(comment.parentId);
			if (parent) {
				parent.replies = [...(parent.replies || []), comment];
				continue;
			}
		}
		roots.push(comment);
	}

	for (const root of roots) {
		sortRepliesByCreatedAt(root);
	}

	return roots;
}

$: commentTree = buildCommentTree(comments);
</script>

<div class="space-y-3">
	{#if loading}
		<div class="space-y-3">
			{#each Array(3) as _, i}
				<div class="card-base border border-white/10 p-4">
					<div class="mb-3 flex items-center gap-3">
						<div class="h-10 w-10 rounded-full bg-white/8"></div>
						<div class="flex-1">
							<div class="mb-1 h-4 w-24 rounded bg-white/8"></div>
							<div class="h-3 w-32 rounded bg-white/5"></div>
						</div>
					</div>
					<div class="space-y-2">
						<div class="h-4 w-full rounded bg-white/8"></div>
						<div class="h-4 w-3/4 rounded bg-white/8"></div>
					</div>
				</div>
			{/each}
		</div>
	{:else if comments.length === 0}
		<div class="card-base p-4 text-white/50">暂无评论，来发表第一条吧。</div>
	{:else}
		<div class="card-base border border-white/10 p-4 md:p-5 space-y-4">
			<div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
				<h2 class="text-xl font-bold text-white">所有评论</h2>
				<div class="flex items-center gap-3">
					<label class="flex items-center gap-2 text-sm text-white/45">
						<span>排序</span>
						<select
							value={commentSort}
							class="forum-select rounded-xl border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--primary)] disabled:opacity-60"
							disabled={loading}
							on:change={(event) => onSortChange((event.currentTarget as HTMLSelectElement).value)}
						>
							{#each commentSortOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>
					<span class="text-sm text-white/35">{comments.length} 条</span>
				</div>
			</div>
			<div class="space-y-3">
				{#each commentTree as comment, i (comment.id)}
				<div>
					<CommentItem
						{comment}
						{activeReplyParentId}
						{canReply}
						{onReplyToggle}
						{onReplyContentChange}
						{onReplySubmit}
						{onReplyEscape}
						{onCommentPatched}
						{currentUser}
						onCommentDeleted={onCommentDeleted}
					>
						<div slot="reply-editor" class="space-y-3">
							<ForumMarkdownEditor
								bind:value={replyContent}
								shellClass="reply-editor-shell"
								mode="reply"
								uploadType="comment"
								uploadPostId={postId}
								placeholder="写下你的回复（支持 Markdown）"
								submitting={submittingReply}
								minHeight={200}
								submitHint="Ctrl/Cmd + Enter 提交，Esc 收起"
								on:change={(event) => onReplyContentChange(event.detail.value)}
								on:submit={() => onReplySubmit(comment)}
								on:escape={onReplyEscape}
							/>
							<div class="flex items-center justify-end gap-2">
								<button class="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/55" type="button" on:click={onReplyEscape}>取消</button>
								<button class="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-black/80 disabled:opacity-60" type="button" disabled={submittingReply || !replyContent.trim()} on:click={() => onReplySubmit(comment)}>回复</button>
							</div>
						</div>
					</CommentItem>
				</div>
				{/each}
			</div>
		</div>
	{/if}
</div>



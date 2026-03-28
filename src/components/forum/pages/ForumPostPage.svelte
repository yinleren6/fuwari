<script lang="ts">
	import { onMount } from "svelte";
	import { get } from "svelte/store";
	import Icon from "@iconify/svelte";
	import CommentList from "@/components/forum/CommentList.svelte";
	import ForumMarkdownContent from "@/components/forum/ForumMarkdownContent.svelte";
	import ForumMarkdownEditor from "@/components/forum/ForumMarkdownEditor.svelte";
	import { createComment, getComments } from "@/forum/api/comments";
	import { getSession } from "@/forum/api/auth";
	import { getPost, likePost } from "@/forum/api/posts";
	import { forumAuth } from "@/forum/stores/auth";
	import { ForumApiError } from "@/forum/types/api";
	import type { ForumComment } from "@/forum/types/comment";
	import type { ForumPostDetail } from "@/forum/types/post";
	import type { ForumUser } from "@/forum/types/user";
	import { renderForumMarkdown } from "@/forum/utils/markdown";

	export let postId = "";

	let post: ForumPostDetail | null = null;
	let comments: ForumComment[] = [];
	let loading = true;
	let commentsLoading = true;
	let likeBusy = false;
	let commentSubmitting = false;
	let replySubmitting = false;
	let commentContent = "";
	let replyContent = "";
	let commentStatus = "";
	let activeReplyParentId: string | null = null;
	let hasToken = false;
	let currentUser: ForumUser | null = null;
	let authReady = false;
	let canEditPost = false;

	function formatDate(value?: string) {
		if (!value) return "刚刚";
		return new Date(value).toLocaleString("zh-CN");
	}

	function refreshCommentCount() {
		if (!post) return;
		post = { ...post, commentCount: comments.length };
	}

	function patchCommentInTree(list: ForumComment[], commentId: string, patch: Partial<ForumComment>) {
		return list.map((item) => {
			if (item.id === commentId) {
				return { ...item, ...patch };
			}
			if (item.replies?.length) {
				return { ...item, replies: patchCommentInTree(item.replies, commentId, patch) };
			}
			return item;
		});
	}

	async function loadPost() {
		loading = true;
		try {
			const result = await getPost(postId);
			post = {
				...result,
				rendered: {
					html: renderForumMarkdown(result.content || result.excerpt || ""),
				},
			};
			if (typeof document !== "undefined" && result.title) {
				document.title = `${result.title} - 《二叉树树》官方网站`;
			}
		} catch (error) {
			console.error(error);
			post = null;
		} finally {
			loading = false;
		}
	}

	async function loadComments() {
		commentsLoading = true;
		try {
			comments = await getComments(postId);
			refreshCommentCount();
		} catch (error) {
			console.error(error);
			comments = [];
		} finally {
			commentsLoading = false;
		}
	}

	async function toggleLike() {
		if (!post || likeBusy) return;
		likeBusy = true;
		try {
			const previousLiked = Boolean(post.liked);
			const previousLikeCount = post.likeCount ?? 0;
			const result = await likePost(post.id);
			const nextLiked = Boolean(result.liked);
			const nextLikeCount =
				typeof result.likeCount === "number"
					? result.likeCount
					: Math.max(0, previousLikeCount + (nextLiked === previousLiked ? 0 : nextLiked ? 1 : -1));
			post = { ...post, liked: nextLiked, likeCount: nextLikeCount };
		} catch (error) {
			console.error(error);
		} finally {
			likeBusy = false;
		}
	}

	async function submitComment(parentId?: string) {
		const isReply = Boolean(parentId);
		const content = (isReply ? replyContent : commentContent).trim();
		if (!content) {
			commentStatus = isReply ? "请先填写回复内容。" : "请先填写评论内容。";
			return;
		}

		if (isReply) {
			replySubmitting = true;
		} else {
			commentSubmitting = true;
		}
		commentStatus = isReply ? "正在回复..." : "正在发表评论...";

		try {
			await createComment({ postId, content, parentId });
			if (isReply) {
				replyContent = "";
				activeReplyParentId = null;
			} else {
				commentContent = "";
			}
			await loadComments();
			commentStatus = isReply ? "回复成功。" : "评论成功。";
		} catch (error) {
			commentStatus = error instanceof Error ? error.message : isReply ? "回复失败，请稍后重试。" : "评论失败，请稍后重试。";
		} finally {
			if (isReply) {
				replySubmitting = false;
			} else {
				commentSubmitting = false;
			}
		}
	}

	function setReplyTarget(commentId: string | null) {
		activeReplyParentId = commentId;
		if (!commentId) {
			replyContent = "";
		}
	}

	function patchComment(commentId: string, patch: Partial<ForumComment>) {
		comments = patchCommentInTree(comments, commentId, patch);
	}

	async function handleCommentDeleted() {
		commentStatus = "正在刷新评论列表...";
		await loadComments();
		commentStatus = "评论已删除。";
	}

	function resolvePostId() {
		if (postId) {
			return postId;
		}
		if (typeof window === "undefined") {
			return "";
		}
		return new URLSearchParams(window.location.search).get("id") || "";
	}

	function normalizeRole(role?: string) {
		if (!role) {
			return "";
		}
		const normalizedRole = role.trim().toLowerCase();
		return ["admin", "administrator", "root", "superadmin", "super_admin"].includes(normalizedRole) ? "admin" : normalizedRole;
	}

	function isCurrentUserAdmin(user: ForumUser | null) {
		return normalizeRole(user?.role) === "admin";
	}

	$: canEditPost = Boolean(post && authReady && currentUser && (isCurrentUserAdmin(currentUser) || Boolean(post.authorId && currentUser.id === post.authorId)));

	async function ensureCurrentUser() {
		const state = get(forumAuth);
		hasToken = Boolean(forumAuth.getToken()) || Boolean(state.token);
		currentUser = state.user;
		authReady = Boolean(!hasToken || state.user);
		if (!hasToken || state.user) {
			return;
		}
		try {
			const session = await getSession();
			forumAuth.setSession(session);
			currentUser = session.user;
			hasToken = Boolean(session.token || forumAuth.getToken());
		} catch (error) {
			if (error instanceof ForumApiError && error.status === 401) {
				forumAuth.clear();
				hasToken = false;
				currentUser = null;
			} else {
				console.error(error);
			}
		} finally {
			authReady = true;
		}
	}

	onMount(() => {
		postId = resolvePostId();
		hasToken = Boolean(forumAuth.getToken()) || Boolean(get(forumAuth).token);
		currentUser = get(forumAuth).user;
		authReady = Boolean(!hasToken || currentUser);
		const unsubscribe = forumAuth.subscribe((state) => {
			hasToken = Boolean(state.token);
			currentUser = state.user;
			authReady = Boolean(!state.token || state.user);
		});
		void ensureCurrentUser();
		if (postId) {
			loadPost();
			loadComments();
		} else {
			loading = false;
			commentsLoading = false;
			post = null;
		}
		return unsubscribe;
	});
</script>

{#if loading}
	<div class="card-base p-6 text-white/50">正在加载帖子详情...</div>
{:else if !post}
	<div class="card-base p-6 text-white/50">帖子不存在或当前环境不可访问。</div>
{:else}
	<div class="space-y-5">
		<article class="card-base border border-white/10 p-6 md:p-8">
			<div class="mb-6 flex flex-col gap-4 border-b border-white/10 pb-6">
				<div class="flex flex-wrap items-center justify-between gap-3 text-xs text-white/40">
					<div class="flex flex-wrap items-center gap-3">
						{#if post.isPinned}
							<span class="inline-flex items-center gap-1 rounded-lg border border-[var(--primary)]/25 bg-[var(--primary)]/12 px-2.5 py-1 text-xs font-medium text-[var(--primary)]" title="置顶帖子" aria-label="置顶帖子">
								<Icon icon="material-symbols:keep-rounded" />
								<span>置顶</span>
							</span>
						{/if}
						<span class="rounded-full bg-white/8 px-3 py-1 text-[var(--primary)]">{post.category?.name || "未分类"}</span>
						<div class="flex items-center gap-2">
							{#if post.author?.avatarUrl}
								<img src={post.author.avatarUrl} alt={post.author.displayName || post.author.username || "用户头像"} class="h-8 w-8 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
							{:else}
								<span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/45">
									<Icon icon="material-symbols:person-outline-rounded" />
								</span>
							{/if}
							<span>{post.author?.displayName || post.author?.username || "匿名用户"}</span>
						</div>
						<span>{formatDate(post.updatedAt || post.createdAt)}</span>
					</div>
					<div class="flex flex-wrap gap-3">
						<a href="/forum/" class="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/60">返回论坛首页</a>
						{#if canEditPost}
							<a href={`/forum/edit/?id=${encodeURIComponent(post.id)}`} class="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/75">编辑帖子</a>
						{/if}
						<div class="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/60">
							<div class="flex items-center gap-2">
								<Icon icon="material-symbols:visibility-outline-rounded" class="text-[var(--primary)]" />
								<span>{post.viewCount || 0} 浏览</span>
							</div>
						</div>
						<button class="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/75 disabled:opacity-60" disabled={likeBusy} on:click={toggleLike}>
							<div class="flex items-center gap-2">
								<Icon icon={post.liked ? "material-symbols:favorite-rounded" : "material-symbols:favorite-outline-rounded"} class="text-[var(--primary)]" />
								<span>{post.likeCount || 0} 赞</span>
							</div>
						</button>
					</div>
				</div>
				<h1 class="text-3xl font-bold leading-tight text-white">{post.title}</h1>
			</div>
			<div data-pagefind-body>
				<ForumMarkdownContent content={post.content || post.excerpt || ""} />
			</div>
		</article>
		<section class="space-y-4">
			<div class="card-base border border-white/10 p-4 md:p-5">
				<div class="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
					<h2 class="text-xl font-bold text-white">评论</h2>
					<span class="text-sm text-white/35">{comments.length} 条</span>
				</div>
				{#if hasToken}
					<div class="space-y-3">
						<ForumMarkdownEditor bind:value={commentContent} mode="comment" uploadType="comment" uploadPostId={postId} placeholder="写下你的评论（支持 Markdown）" submitting={commentSubmitting} minHeight={180} submitHint="Ctrl/Cmd + Enter 提交评论" on:submit={() => submitComment()} />
						<div class="flex items-center justify-between gap-3">
							{#if commentStatus}
								<p class="text-sm text-white/45">{commentStatus}</p>
							{:else}
								<span class="text-sm text-white/30">评论与回复都支持 Markdown，预览效果与正文展示一致。</span>
							{/if}
							<button class="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-black/80 disabled:opacity-60" type="button" disabled={commentSubmitting || !commentContent.trim()} on:click={() => submitComment()}>发表评论</button>
						</div>
					</div>
				{:else}
					<div class="rounded-2xl border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm text-white/50">
						请先<a href="/forum/login/" class="mx-1 text-[var(--primary)] underline decoration-dashed underline-offset-4">登录论坛</a>后再发表评论或回复。
					</div>
				{/if}
			</div>

			<CommentList
				{comments}
				{postId}
				loading={commentsLoading}
				canReply={hasToken}
				{activeReplyParentId}
				{replyContent}
				submittingReply={replySubmitting}
				onReplyToggle={setReplyTarget}
				onReplyContentChange={(value) => (replyContent = value)}
				onReplySubmit={(comment) => submitComment(comment.id)}
				onReplyEscape={() => setReplyTarget(null)}
				onCommentPatched={patchComment}
				currentUser={currentUser}
				onCommentDeleted={handleCommentDeleted}
			/>
		</section>
	</div>
{/if}

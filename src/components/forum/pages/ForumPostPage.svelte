<script lang="ts">
import CommentList from "@/components/forum/CommentList.svelte";
import ForumMarkdownContent from "@/components/forum/ForumMarkdownContent.svelte";
import ForumMarkdownEditor from "@/components/forum/ForumMarkdownEditor.svelte";
import ForumSkeleton from "@/components/forum/ForumSkeleton.svelte";
import { deleteAdminPost } from "@/forum/api/admin";
import { getSession } from "@/forum/api/auth";
import {
	type CommentListQuery,
	createComment,
	getComments,
} from "@/forum/api/comments";
import { getPost, likePost } from "@/forum/api/posts";
import {
	type NewCommentPayload,
	type PostUpdatedPayload,
	disconnectForumSSE,
	getForumSSE,
} from "@/forum/api/sse";
import { forumAuth } from "@/forum/stores/auth";
import { ForumApiError } from "@/forum/types/api";
import type { ForumComment } from "@/forum/types/comment";
import type { ForumPostDetail } from "@/forum/types/post";
import type { ForumUser } from "@/forum/types/user";
import { renderForumMarkdown } from "@/forum/utils/markdown";
import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
import { formatForumDateTime } from "@/utils/date-utils";
import Icon from "@iconify/svelte";
import { onDestroy, onMount } from "svelte";
import { get } from "svelte/store";

export let postId = "";

let post: ForumPostDetail | null = null;
let comments: ForumComment[] = [];
let loading = true;
let contentVisible = false;
let commentsLoading = true;
let loadErrorKind: "not-found" | "unreachable" | "unknown" | null = null;
let loadErrorMessage = "";
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
let canDeletePost = false;
let deleteBusy = false;
const commentSortOptions: Array<{ value: string; label: string }> = [
	{ value: "hot", label: "最热" },
	{ value: "oldest", label: "最早" },
	{ value: "latest", label: "最新" },
];
let commentSort = "hot";
let forumSSE = getForumSSE();
let sseConnected = false;

function refreshCommentCount() {
	if (!post) return;
	post = { ...post, commentCount: comments.length };
}

function handleNewComment(payload: Record<string, unknown>) {
	const commentPayload = payload as unknown as NewCommentPayload;
	console.log("[ForumPostPage] New comment event received:", commentPayload);
	if (commentPayload.postId === postId) {
		console.log(
			"[ForumPostPage] New comment matches current post, refreshing comments...",
		);
		void loadComments();
		emitSuccessToast("评论", "收到新评论，已自动刷新。", true);
	} else {
		console.log("[ForumPostPage] New comment for different post, ignoring");
	}
}

function handlePostUpdated(payload: Record<string, unknown>) {
	const postPayload = payload as unknown as PostUpdatedPayload;
	console.log("[ForumPostPage] Post updated event received:", postPayload);
	if (postPayload.postId === postId) {
		console.log(
			"[ForumPostPage] Post update matches current post, updating content...",
		);
		if (post) {
			post = {
				...post,
				title: postPayload.title || post.title,
				content: postPayload.content || post.content,
				excerpt: postPayload.content || post.excerpt,
				updatedAt: postPayload.updated_at || post.updatedAt,
				rendered: {
					html: renderForumMarkdown(postPayload.content || post.content || ""),
				},
			};
			emitSuccessToast("帖子", "帖子内容已更新。");
		}
	}
}

function setupSSE() {
	if (!postId) {
		console.log("[ForumPostPage] No postId, skipping SSE setup");
		return;
	}

	console.log("[ForumPostPage] Setting up SSE for post:", postId);

	forumSSE.on("new_comment", handleNewComment);
	forumSSE.on("post_updated", handlePostUpdated);
	forumSSE.on("connected", () => {
		sseConnected = true;
		console.log("[ForumPostPage] SSE connected for post:", postId);
	});
	forumSSE.on("disconnected", () => {
		sseConnected = false;
		console.log("[ForumPostPage] SSE disconnected");
	});
	forumSSE.on("subscribed", (payload) => {
		console.log("[ForumPostPage] SSE subscribed event:", payload);
	});

	forumSSE.connect(postId);
}

function cleanupSSE() {
	forumSSE.off("new_comment", handleNewComment);
	forumSSE.off("post_updated", handlePostUpdated);
	forumSSE.off("connected", () => {});
	forumSSE.off("disconnected", () => {});
	forumSSE.disconnect();
}

function getCommentSortQuery(sort: string): CommentListQuery {
	switch (sort) {
		case "oldest":
			return { sortBy: "time", sortDir: "asc" };
		case "latest":
			return { sortBy: "time", sortDir: "desc" };
		case "hot":
		default:
			return { sortBy: "likes", sortDir: "desc" };
	}
}

function patchCommentInTree(
	list: ForumComment[],
	commentId: string,
	patch: Partial<ForumComment>,
): ForumComment[] {
	return list.map((item) => {
		if (item.id === commentId) {
			return { ...item, ...patch };
		}
		if (item.replies?.length) {
			return {
				...item,
				replies: patchCommentInTree(item.replies, commentId, patch),
			};
		}
		return item;
	});
}

async function loadPost() {
	loading = true;
	loadErrorKind = null;
	loadErrorMessage = "";
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
		if (error instanceof ForumApiError) {
			if (error.status === 404) {
				loadErrorKind = "not-found";
				loadErrorMessage = error.message || "帖子不存在。";
			} else {
				loadErrorKind = "unreachable";
				loadErrorMessage =
					error.message || "论坛接口当前不可访问，请检查论坛环境配置。";
			}
		} else {
			loadErrorKind = "unknown";
			loadErrorMessage =
				error instanceof Error ? error.message : "帖子加载失败，请稍后重试。";
		}
	} finally {
		loading = false;
		setTimeout(() => {
			contentVisible = true;
		}, 50);
	}
}

async function loadComments() {
	commentsLoading = true;
	try {
		comments = await getComments(postId, getCommentSortQuery(commentSort));
		refreshCommentCount();
	} catch (error) {
		console.error(error);
		comments = [];
	} finally {
		commentsLoading = false;
	}
}

function changeCommentSort(nextSort: string) {
	if (commentSort === nextSort || commentsLoading) {
		return;
	}
	commentSort = nextSort;
	void loadComments();
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
				: Math.max(
						0,
						previousLikeCount +
							(nextLiked === previousLiked ? 0 : nextLiked ? 1 : -1),
					);
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
		emitErrorToast(
			"评论",
			isReply ? "请先填写回复内容。" : "请先填写评论内容。",
		);
		return;
	}

	if (isReply) {
		replySubmitting = true;
	} else {
		commentSubmitting = true;
	}
	commentStatus = isReply ? "正在回复..." : "正在发表评论...";

	try {
		console.log("[submitComment] Submitting comment to post:", postId);
		await createComment({ postId, content, parentId });
		console.log(
			"[submitComment] Comment submitted successfully, waiting for WebSocket broadcast...",
		);
		if (isReply) {
			replyContent = "";
			activeReplyParentId = null;
		} else {
			commentContent = "";
		}
		await loadComments();
		commentStatus = "";
		emitSuccessToast("评论", isReply ? "回复成功。" : "评论成功。", true);
	} catch (error) {
		const errorMsg =
			error instanceof Error
				? error.message
				: isReply
					? "回复失败，请稍后重试。"
					: "评论失败，请稍后重试。";
		commentStatus = "";
		emitErrorToast("评论", errorMsg);
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
	void loadComments();
	emitSuccessToast("评论", "评论已删除。", false);
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

function navigateTo(url: string) {
	if (typeof window === "undefined") {
		return;
	}
	const swup = (
		window as Window & { swup?: { navigate: (targetUrl: string) => void } }
	).swup;
	if (swup) {
		swup.navigate(url);
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

function isCurrentUserAdmin(user: ForumUser | null) {
	return normalizeRole(user?.role) === "admin";
}

async function handleDeletePost() {
	if (!post || !canDeletePost || deleteBusy) {
		return;
	}
	if (!window.confirm("确定要删除这篇帖子吗？删除后不可恢复。")) {
		return;
	}
	deleteBusy = true;
	try {
		await deleteAdminPost(post.id);
		emitSuccessToast("帖子管理", "帖子已删除，正在返回论坛首页...", true);
		await new Promise((resolve) => window.setTimeout(resolve, 180));
		navigateTo("/forum/");
	} catch (error) {
		if (error instanceof ForumApiError) {
			if (error.status === 404) {
				emitErrorToast("帖子管理", "帖子不存在或已被删除。");
				await new Promise((resolve) => window.setTimeout(resolve, 180));
				navigateTo("/forum/");
				return;
			}
			if (error.status === 401) {
				forumAuth.clear();
				emitErrorToast("帖子管理", "登录状态已失效，请重新登录后再试。");
				return;
			}
			if (error.status === 403) {
				emitErrorToast("帖子管理", "你没有删除该帖子的管理员权限。");
				return;
			}
			emitErrorToast("帖子管理", error.message || "删帖失败，请稍后重试。");
			return;
		}
		emitErrorToast(
			"帖子管理",
			error instanceof Error ? error.message : "删帖失败，请稍后重试。",
		);
	} finally {
		deleteBusy = false;
	}
}

$: canEditPost = Boolean(
	post &&
		authReady &&
		currentUser &&
		(isCurrentUserAdmin(currentUser) ||
			Boolean(post.authorId && currentUser.id === post.authorId)),
);
$: canDeletePost = Boolean(
	post && authReady && currentUser && isCurrentUserAdmin(currentUser),
);

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
		setupSSE();
	} else {
		loading = false;
		contentVisible = true;
		commentsLoading = false;
		post = null;
	}
	return () => {
		unsubscribe();
		cleanupSSE();
	};
});
</script>

{#if loading}
	<div class="transition-opacity duration-200">
		<ForumSkeleton type="post" />
	</div>
{:else if !post}
	<div 
		class="card-base p-6 text-white/50 space-y-2 transition-opacity duration-200"
		class:opacity-0={!contentVisible}
		class:opacity-100={contentVisible}
	>
		{#if loadErrorKind === "not-found"}
			<p>帖子不存在。</p>
		{:else if loadErrorKind === "unreachable"}
			<p>论坛接口当前不可访问或环境地址错误。</p>
		{:else}
			<p>帖子加载失败。</p>
		{/if}
		{#if loadErrorMessage}
			<p class="text-sm text-white/35">{loadErrorMessage}</p>
		{/if}
	</div>
{:else}
	<div 
		class="space-y-5 transition-opacity duration-200"
		class:opacity-0={!contentVisible}
		class:opacity-100={contentVisible}
	>
		<article class="card-base border border-white/10 p-6 md:p-8">
			<div class="mb-6 flex flex-col gap-4 border-b border-white/10 pb-6">
				<div class="flex flex-wrap items-center justify-between gap-3 text-xs text-white/40">
					<div class="flex flex-wrap items-center gap-3">
						{#if post.isPinned}
							<span class="inline-flex items-center gap-1 rounded-lg border border-[var(--primary)] bg-[var(--primary)]/12 px-2.5 py-1 text-xs font-medium text-[var(--primary)]" title="置顶帖子" aria-label="置顶帖子">
								<Icon icon="material-symbols:keep-rounded" />
								<span>置顶</span>
							</span>
						{/if}
						<span class="rounded-full bg-white/8 px-3 py-1 text-[var(--primary)]">{post.category?.name || "未分类"}</span>
						<div class="flex items-center gap-2">
							{#if post.authorId}
								<button class="flex items-center gap-2 rounded-xl text-left transition hover:text-[var(--primary)]" type="button" on:click={() => goToUser(post.authorId)}>
									{#if post.author?.avatarUrl}
										<img src={post.author.avatarUrl} alt={post.author.displayName || post.author.username || "用户头像"} class="h-8 w-8 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
									{:else}
										<span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/45">
											<Icon icon="material-symbols:person-outline-rounded" />
										</span>
									{/if}
									<span>{post.author?.displayName || post.author?.username || "匿名用户"}</span>
								</button>
							{:else}
								{#if post.author?.avatarUrl}
									<img src={post.author.avatarUrl} alt={post.author.displayName || post.author.username || "用户头像"} class="h-8 w-8 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
								{:else}
									<span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/45">
										<Icon icon="material-symbols:person-outline-rounded" />
									</span>
								{/if}
								<span>{post.author?.displayName || post.author?.username || "匿名用户"}</span>
							{/if}
						</div>
						<span>{formatForumDateTime(post.updatedAt || post.createdAt)}</span>
					</div>
					<div class="flex flex-wrap gap-3">
						<div class="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/60">
							<div class="flex items-center gap-2">
								<span class="h-2 w-2 rounded-full {sseConnected ? 'bg-green-400' : 'bg-red-400'}"></span>
								<span>{sseConnected ? '实时连接' : '未连接'}</span>
							</div>
						</div>
						<a href="/forum/" class="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/60">返回论坛首页</a>
						{#if canEditPost}
							<a href={`/forum/edit/?id=${encodeURIComponent(post.id)}`} class="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white/75">编辑帖子</a>
						{/if}
						{#if canDeletePost}
							<button class="rounded-xl border border-red-200/20 px-4 py-2 text-sm font-bold text-red-200 disabled:opacity-60" type="button" disabled={deleteBusy} on:click={handleDeletePost}>{deleteBusy ? "删除中..." : "删除帖子"}</button>
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
				<div class="mb-4 border-b border-white/10 pb-4">
					<h2 class="text-xl font-bold text-white">发布评论</h2>
				</div>
				{#if hasToken}
					<div class="space-y-3">
						<ForumMarkdownEditor bind:value={commentContent} mode="comment" uploadType="comment" uploadPostId={postId} placeholder="写下你的评论（支持 Markdown）" submitting={commentSubmitting} minHeight={260} submitHint="Ctrl/Cmd + Enter 提交评论" on:submit={() => submitComment()} />
						<div class="flex items-center justify-between gap-3">
							{#if commentStatus}
								<p class="text-sm text-white/45">{commentStatus}</p>
							{/if}
							<button class="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-black/80 disabled:opacity-60" type="button" disabled={commentSubmitting || !commentContent.trim()} on:click={() => submitComment()}>发表评论</button>
						</div>
					</div>
				{:else}
					<div class="rounded-2xl border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm text-white/50">
						请先<a href="/forum/auth/login/" class="mx-1 text-[var(--primary)] underline decoration-dashed underline-offset-4">登录论坛</a>后再发表评论或回复。
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
				{commentSort}
				{commentSortOptions}
				onSortChange={changeCommentSort}
			/>
		</section>
	</div>
{/if}

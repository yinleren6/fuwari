<script lang="ts">
import ForumMarkdownEditor from "@/components/forum/ForumMarkdownEditor.svelte";
import { getSession } from "@/forum/api/auth";
import { createPost, getPost, updatePost } from "@/forum/api/posts";
import { forumAuth } from "@/forum/stores/auth";
import { ForumApiError } from "@/forum/types/api";
import type { ForumPostDetail, ForumPostInput } from "@/forum/types/post";
import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
import Icon from "@components/IconSvelte.svelte";
import { onMount } from "svelte";
import { get } from "svelte/store";

export let mode: "create" | "edit" = "create";
export let postId = "";
export let initialTitle = "";
export let initialContent = "";
export let initialCategoryId = "";

let title = initialTitle;
let content = initialContent;
let categoryId = initialCategoryId;
let status = "";
let submitting = false;
let loadingPost = mode === "edit";
let canSubmit = mode === "create";
let isLoggedIn = false;
let currentUserId = "";
let isAdmin = false;
let permissionChecked = mode !== "edit";

const pageTitle = mode === "edit" ? "编辑帖子" : "发布帖子";
const submitLabel = mode === "edit" ? "保存" : "发布";
const submittingLabel = mode === "edit" ? "正在保存..." : "正在发布...";
const editorSubmitHint =
	mode === "edit" ? "Ctrl/Cmd + Enter 保存" : "Ctrl/Cmd + Enter 发布";

$: cancelHref =
	mode === "edit" && postId
		? `/forum/post/?id=${encodeURIComponent(postId)}`
		: "/forum/";

function resolvePostId() {
	if (postId) {
		return postId;
	}
	if (typeof window === "undefined") {
		return "";
	}
	return new URLSearchParams(window.location.search).get("id") || "";
}

function applyPost(post: ForumPostDetail) {
	title = post.title || "";
	content = post.content || post.excerpt || "";
	categoryId = post.categoryId || "";
}

function updatePermission(post: ForumPostDetail | null) {
	permissionChecked = true;
	if (mode !== "edit") {
		canSubmit = true;
		return;
	}
	if (!isLoggedIn) {
		canSubmit = false;
		return;
	}
	if (!post) {
		canSubmit = false;
		return;
	}
	canSubmit =
		isAdmin ||
		Boolean(post.authorId && currentUserId && post.authorId === currentUserId);
}

async function ensureSession() {
	const authState = get(forumAuth);
	isLoggedIn = Boolean(authState.token || forumAuth.getToken());
	currentUserId = authState.user?.id || "";
	isAdmin = authState.user?.role === "admin";

	if (!isLoggedIn) {
		return;
	}
	if (authState.user) {
		return;
	}

	try {
		const session = await getSession();
		forumAuth.setSession(session);
		isLoggedIn = Boolean(session.token || forumAuth.getToken());
		currentUserId = session.user?.id || "";
		isAdmin = session.user?.role === "admin";
	} catch (error) {
		if (error instanceof ForumApiError && error.status === 401) {
			forumAuth.clear();
			isLoggedIn = false;
			currentUserId = "";
			isAdmin = false;
			return;
		}
		throw error;
	}
}

async function loadEditingPost() {
	if (mode !== "edit") {
		loadingPost = false;
		permissionChecked = true;
		canSubmit = true;
		return;
	}

	postId = resolvePostId();
	if (!postId) {
		emitErrorToast("发帖", "缺少帖子 ID，无法编辑。");
		loadingPost = false;
		permissionChecked = true;
		canSubmit = false;
		return;
	}

	loadingPost = true;
	status = "";
	try {
		await ensureSession();
		if (!isLoggedIn) {
			emitErrorToast("发帖", "请先登录论坛后再编辑帖子。");
			permissionChecked = true;
			canSubmit = false;
			return;
		}

		const post = await getPost(postId);
		applyPost(post);
		updatePermission(post);
		if (!canSubmit) {
			emitErrorToast("发帖", "你没有权限编辑这篇帖子。");
		}
	} catch (error) {
		permissionChecked = true;
		emitErrorToast(
			"发帖",
			error instanceof Error ? error.message : "帖子加载失败，请稍后重试。",
		);
		canSubmit = false;
	} finally {
		loadingPost = false;
	}
}

async function submit() {
	if (submitting || loadingPost) {
		return;
	}
	if (!title.trim() || !content.trim()) {
		emitErrorToast("发帖", "请先填写标题和内容。");
		return;
	}
	if (mode === "edit") {
		if (!postId) {
			emitErrorToast("发帖", "缺少帖子 ID，无法保存。");
			return;
		}
		if (!canSubmit) {
			emitErrorToast(
				"发帖",
				isLoggedIn ? "你没有权限编辑这篇帖子。" : "请先登录论坛后再编辑帖子。",
			);
			return;
		}
	}

	const payload: ForumPostInput = {
		title: title.trim(),
		content: content.trim(),
		categoryId: categoryId.trim() || undefined,
	};

	submitting = true;
	status = submittingLabel;

	try {
		const result =
			mode === "edit"
				? await updatePost(postId, payload)
				: await createPost(payload);
		const nextPostId = String(result.id || postId || "").trim();
		if (!nextPostId) {
			throw new Error(
				mode === "edit"
					? "保存成功，但未拿到帖子 ID"
					: "发帖成功，但未拿到帖子 ID",
			);
		}
		emitSuccessToast(
			"发帖",
			`${mode === "edit" ? "保存" : "发布"}成功，即将前往帖子 #${nextPostId}`,
			true,
		);
		window.location.href = `/forum/post/?id=${encodeURIComponent(nextPostId)}`;
	} catch (error) {
		emitErrorToast(
			"发帖",
			error instanceof Error
				? error.message
				: mode === "edit"
					? "保存失败，请稍后重试。"
					: "发布失败，请稍后重试。",
		);
	} finally {
		submitting = false;
	}
}

onMount(() => {
	const unsubscribe = forumAuth.subscribe((state) => {
		isLoggedIn = Boolean(state.token);
		currentUserId = state.user?.id || "";
		isAdmin = state.user?.role === "admin";
	});
	loadEditingPost();
	return unsubscribe;
});
</script>

<div class="card-base space-y-4 p-6 md:p-8">
	<div class="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<div class="mb-2 flex items-center gap-2">
				<Icon icon="material-symbols:edit-square-outline-rounded" class="text-3xl text-[var(--primary)]" />
				<h1 class="text-2xl font-bold text-white">{pageTitle}</h1>
			</div>
			<p class="text-sm text-white/45">统一使用 Markdown 编辑器，预览与帖子详情页展示效果保持一致。</p>
		</div>
		<div class="flex flex-wrap gap-3">
			<a href="/forum/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/60">返回论坛首页</a>
			<a href="/forum/me/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70">个人中心</a>
		</div>
	</div>

	{#if mode === "edit" && loadingPost}
		<div class="rounded-2xl border border-white/10 bg-white/3 px-4 py-5 text-sm text-white/50">正在加载原帖内容...</div>
	{:else}
		<div class="space-y-2">
			<label class="text-sm text-white/65" for="forum-post-title">标题</label>
			<input
				id="forum-post-title"
				bind:value={title}
				class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
				placeholder="输入帖子标题"
				disabled={mode === "edit" && permissionChecked && !canSubmit}
			/>
		</div>
		<div class="space-y-2">
			<label class="text-sm text-white/65" for="forum-post-content">内容</label>
			<ForumMarkdownEditor
				bind:value={content}
				mode="post"
				uploadType="post"
				placeholder="写点什么吧，支持 Markdown 语法..."
				submitting={submitting || (mode === "edit" && permissionChecked && !canSubmit)}
				minHeight={420}
				submitHint={editorSubmitHint}
				on:submit={submit}
			/>
		</div>
		<div class="flex items-center gap-3">
			<button class="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-black/80 transition disabled:opacity-60" disabled={submitting || (mode === "edit" && permissionChecked && !canSubmit)} on:click={submit}>{submitLabel}</button>
			{#if mode === "edit"}
				<a href={cancelHref} class="rounded-xl border border-white/10 px-5 py-3 font-bold text-white/70">取消</a>
			{/if}
			{#if status}
				<p class="text-sm text-white/55">{status}</p>
			{/if}
		</div>
		{#if mode === "edit" && !isLoggedIn}
			<div class="rounded-2xl border border-dashed border-white/10 bg-white/3 px-4 py-5 text-sm text-white/50">
				请先<a href="/forum/auth/login/" class="mx-1 text-[var(--primary)] underline decoration-dashed underline-offset-4">登录论坛</a>后再编辑帖子。
			</div>
		{/if}
	{/if}
</div>

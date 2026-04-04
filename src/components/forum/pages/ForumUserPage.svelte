<script lang="ts">
import ForumSkeleton from "@/components/forum/ForumSkeleton.svelte";
import PostList from "@/components/forum/PostList.svelte";
import { getCurrentUser, getSession } from "@/forum/api/auth";
import { getUserPosts, getUserProfile } from "@/forum/api/users";
import { forumAuth } from "@/forum/stores/auth";
import { ForumApiError } from "@/forum/types/api";
import type { ForumPostSummary } from "@/forum/types/post";
import type { ForumUser } from "@/forum/types/user";
import { formatForumDateTime } from "@/utils/date-utils";
import Icon from "@iconify/svelte";
import { onMount } from "svelte";
import { get } from "svelte/store";

export let userId = "";

let profile: ForumUser | null = null;
let posts: ForumPostSummary[] = [];
let currentUser: ForumUser | null = null;
let loading = true;
let contentVisible = false;
let postsLoading = true;
let errorMessage = "";

function resolveUserId() {
	if (userId) {
		return userId;
	}
	if (typeof window === "undefined") {
		return "";
	}
	const urlParams = new URLSearchParams(window.location.search);
	const queryId = urlParams.get("id");
	if (queryId) {
		return decodeURIComponent(queryId);
	}
	const match = window.location.pathname.match(/\/forum\/u\/([^/]+)\/?$/);
	return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function genderLabel(gender?: ForumUser["gender"]) {
	switch (gender) {
		case "male":
			return "男";
		case "female":
			return "女";
		case "other":
			return "其他";
		case "prefer_not_to_say":
			return "不方便透露";
		default:
			return "未设置";
	}
}

$: isSelfProfile = Boolean(
	profile && currentUser && profile.id === currentUser.id,
);

async function ensureCurrentUser() {
	const state = getSessionState();
	currentUser = state.user;
	if (!state.hasToken || state.user) {
		return;
	}
	try {
		const session = await getSession();
		forumAuth.setSession(session);
		currentUser = session.user;
	} catch (error) {
		if (error instanceof ForumApiError && error.status === 401) {
			forumAuth.clear();
			currentUser = null;
			return;
		}
		try {
			currentUser = await getCurrentUser();
		} catch {
			currentUser = null;
		}
	}
}

function getSessionState() {
	const token = forumAuth.getToken();
	const state = get(forumAuth);
	return {
		hasToken: Boolean(token || state.token),
		user: state.user,
	};
}

async function loadPage() {
	loading = true;
	postsLoading = true;
	errorMessage = "";
	try {
		await ensureCurrentUser();
		const nextUserId = resolveUserId();
		if (!nextUserId) {
			throw new Error("用户 ID 无效。");
		}
		const [nextProfile, nextPosts] = await Promise.all([
			getUserProfile(nextUserId),
			getUserPosts(nextUserId),
		]);
		profile = nextProfile;
		posts = nextPosts.items;
	} catch (error) {
		profile = null;
		posts = [];
		errorMessage =
			error instanceof Error ? error.message : "用户主页加载失败。";
	} finally {
		loading = false;
		postsLoading = false;
		setTimeout(() => {
			contentVisible = true;
		}, 50);
	}
}

onMount(() => {
	userId = resolveUserId();
	const unsubscribe = forumAuth.subscribe((state) => {
		currentUser = state.user;
	});
	void loadPage();
	return unsubscribe;
});
</script>

{#if loading}
	<div class="transition-opacity duration-200">
		<ForumSkeleton type="profile" />
	</div>
{:else if !profile}
	<div 
		class="card-base p-6 text-white/50 space-y-2 transition-opacity duration-200"
		class:opacity-0={!contentVisible}
		class:opacity-100={contentVisible}
	>
		<p>用户主页不可用。</p>
		{#if errorMessage}
			<p class="text-sm text-white/35">{errorMessage}</p>
		{/if}
	</div>
{:else}
	<div 
		class="space-y-6 transition-opacity duration-200"
		class:opacity-0={!contentVisible}
		class:opacity-100={contentVisible}
	>
		<section class="card-base p-6 md:p-8 space-y-5">
			<div class="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-start md:justify-between">
				<div class="flex items-start gap-4 min-w-0">
					{#if profile.avatarUrl}
						<img src={profile.avatarUrl} alt={profile.displayName || profile.username || "用户头像"} class="h-20 w-20 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
					{:else}
						<div class="flex h-20 w-20 items-center justify-center rounded-full bg-white/8 text-white/40">
							<Icon icon="material-symbols:person-outline-rounded" class="text-4xl" />
						</div>
					{/if}
					<div class="min-w-0 space-y-2">
						<h1 class="text-2xl font-bold text-white break-words">{profile.displayName || profile.username}</h1>
						{#if profile.bio}
							<p class="whitespace-pre-wrap text-sm text-white/70">{profile.bio}</p>
						{/if}
					</div>
				</div>
				<div class="flex flex-wrap gap-3">
					<a href="/forum/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/60">返回论坛首页</a>
					{#if isSelfProfile}
						<a href="/forum/me/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70">个人中心</a>
						<a href="/forum/me/profile/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70">编辑个人信息</a>
					{/if}
				</div>
			</div>

			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4 text-sm text-white/65">
				<div class="rounded-2xl border border-white/10 bg-white/5 p-4">
					<div class="text-white/40">性别</div>
					<div class="mt-2 font-bold text-white">{genderLabel(profile.gender)}</div>
				</div>
				<div class="rounded-2xl border border-white/10 bg-white/5 p-4">
					<div class="text-white/40">年龄</div>
					<div class="mt-2 font-bold text-white">{profile.age ?? "未设置"}</div>
				</div>
				<div class="rounded-2xl border border-white/10 bg-white/5 p-4">
					<div class="text-white/40">地区</div>
					<div class="mt-2 font-bold text-white">{profile.region || "未设置"}</div>
				</div>
				<div class="rounded-2xl border border-white/10 bg-white/5 p-4">
					<div class="text-white/40">注册时间</div>
					<div class="mt-2 font-bold text-white">{profile.createdAt ? formatForumDateTime(profile.createdAt) : "未知"}</div>
				</div>
			</div>
		</section>

		<section class="card-base p-6 md:p-8 space-y-4">
			<div class="flex items-center justify-between gap-3">
				<h2 class="text-xl font-bold text-white">TA 发布的帖子</h2>
				<span class="text-sm text-white/35">{posts.length} 篇</span>
			</div>
			<PostList posts={posts} loading={postsLoading} emptyText="TA 暂时还没有公开帖子。" />
		</section>
	</div>
{/if}

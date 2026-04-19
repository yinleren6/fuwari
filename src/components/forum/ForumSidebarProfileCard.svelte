<script lang="ts">
import { getCurrentUser } from "@/forum/api/auth";
import { forumAuth } from "@/forum/stores/auth";
import { ForumApiError } from "@/forum/types/api";
import type { ForumUser } from "@/forum/types/user";
import Icon from "@components/IconSvelte.svelte";
import { onMount } from "svelte";
import { get } from "svelte/store";

let user: ForumUser | null = null;
let hasToken = false;

function resolveDisplayName(nextUser: ForumUser | null) {
	return nextUser?.displayName || nextUser?.username || "游客";
}

function normalizeBio(value?: string) {
	const normalized = value?.trim();
	return normalized ? normalized : "";
}

function resolveUser(nextUser: ForumUser | null) {
	user = nextUser;
}

async function restoreCurrentUser() {
	const state = get(forumAuth);
	hasToken = Boolean(state.token || forumAuth.getToken());
	resolveUser(state.user);
	if (!hasToken || state.user) {
		return;
	}
	try {
		const nextUser = await getCurrentUser();
		forumAuth.setSession({
			user: nextUser,
			token: null,
			requiresTotp: false,
		});
		resolveUser(nextUser);
	} catch (error) {
		if (error instanceof ForumApiError && error.status === 401) {
			forumAuth.clear();
			hasToken = false;
			resolveUser(null);
			return;
		}
		console.error(error);
	}
}

onMount(() => {
	// 只在论坛路由下才发起用户信息请求
	const currentPath = window.location.pathname;
	const isForumRoute = currentPath.startsWith("/forum/");
	if (!isForumRoute) {
		return;
	}

	const unsubscribe = forumAuth.subscribe((state) => {
		hasToken = Boolean(state.token || forumAuth.getToken());
		resolveUser(state.user);
	});
	void restoreCurrentUser();
	return () => {
		unsubscribe();
	};
});

$: displayName = resolveDisplayName(user);
$: username = user?.username?.trim() || "";
$: bio = normalizeBio(user?.bio);
$: socialLinks = [] as Array<{ label: string; url: string; icon: string }>;
$: isGuest = !user;
</script>

{#if isGuest}
	<a href="/forum/auth/login/" class="card-base block border border-white/10 p-3" aria-label="点击登录论坛">
		<div class="mb-3 overflow-hidden rounded-xl">
			<div class="flex aspect-square w-full items-center justify-center bg-white/5 text-white/35">
				<Icon icon="material-symbols:person-outline-rounded" class="text-7xl" />
			</div>
		</div>

		<div class="px-2">
			<div class="mb-1 text-center text-xl font-bold text-neutral-50 transition">
				<h3>{displayName}</h3>
			</div>
			<div class="mx-auto mb-2 h-1 w-5 rounded-full bg-[var(--primary)] transition"></div>
			<div class="text-center text-sm text-[var(--primary)]">点击登录论坛</div>
		</div>
	</a>
{:else}
	<div class="card-base border border-white/10 p-3">
		<div class="mb-3 overflow-hidden rounded-xl">
			{#if user?.avatarUrl}
				<img src={user.avatarUrl} alt={`${displayName} 的头像`} class="h-full w-full object-cover transition duration-500" width="640" height="640" loading="eager" decoding="async" referrerpolicy="no-referrer" />
			{:else}
				<div class="flex aspect-square w-full items-center justify-center bg-white/5 text-white/35">
					<Icon icon="material-symbols:person-outline-rounded" class="text-7xl" />
				</div>
			{/if}
		</div>

		<div class="px-2">
			<div class="mb-1 text-center text-xl font-bold text-neutral-50 transition">
				<h3>{displayName}</h3>
			</div>
			<div class="mx-auto mb-2 h-1 w-5 rounded-full bg-[var(--primary)] transition"></div>
			{#if bio}
				<div class="mb-2.5 text-center text-neutral-400 transition">{bio}</div>
			{/if}
			{#if socialLinks.length > 0}
				<div class="mb-1 flex flex-wrap justify-center gap-2">
					{#each socialLinks as item}
						<a rel="me noopener noreferrer" aria-label={item.label} href={item.url} target="_blank" class="btn-regular h-10 rounded-lg px-3 font-bold active:scale-95">
							<span class="inline-flex items-center gap-2">
								<Icon icon={item.icon} class="text-[1.25rem]" />
								<span>{item.label}</span>
							</span>
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

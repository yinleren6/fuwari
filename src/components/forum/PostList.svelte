<script lang="ts">
import type { ForumPostSummary } from "@/forum/types/post";
import { formatForumDateTime } from "@/utils/date-utils";
import Icon from "@iconify/svelte";

export let posts: ForumPostSummary[] | null | undefined = [];
export let loading = false;
export let emptyText = "暂无帖子";

$: safePosts = Array.isArray(posts) ? posts : [];

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

function goToPost(postId: string) {
	navigateTo(`/forum/post/?id=${encodeURIComponent(postId)}`);
}

function goToUser(userId?: string, event?: MouseEvent | KeyboardEvent) {
	event?.stopPropagation();
	if (!userId) {
		return;
	}
	navigateTo(`/forum/u/?id=${encodeURIComponent(userId)}`);
}
</script>

<div class="space-y-4">
	{#if loading}
		{#each Array(3) as _, i}
			<div class="card-base p-5 animate-pulse">
				<div class="mb-4 flex items-start justify-between gap-4">
					<div class="min-w-0 flex-1">
						<div class="mb-3 flex items-center gap-2">
							<div class="h-6 w-48 rounded bg-white/10"></div>
						</div>
						<div class="mb-2 h-4 w-full rounded bg-white/8"></div>
						<div class="h-4 w-3/4 rounded bg-white/8"></div>
					</div>
					<div class="h-6 w-16 shrink-0 rounded-full bg-white/8"></div>
				</div>
				<div class="mb-4 h-40 w-full rounded-2xl bg-white/5"></div>
				<div class="mb-4 flex items-center gap-3">
					<div class="h-9 w-9 rounded-full bg-white/8"></div>
					<div class="min-w-0 flex-1">
						<div class="mb-1 h-4 w-24 rounded bg-white/8"></div>
						<div class="h-3 w-32 rounded bg-white/5"></div>
					</div>
				</div>
				<div class="flex items-center gap-4">
					<div class="h-4 w-16 rounded bg-white/5"></div>
					<div class="h-4 w-16 rounded bg-white/5"></div>
					<div class="h-4 w-16 rounded bg-white/5"></div>
				</div>
			</div>
		{/each}
	{:else if safePosts.length === 0}
		<div class="card-base p-5 text-white/50">{emptyText}</div>
	{:else}
		{#each safePosts as post, i}
			<div 
				class="group card-base card-hover block w-full cursor-pointer p-5 text-white/90 no-underline transition-opacity duration-200" 
				style="animation: fade-in 200ms {i * 50}ms forwards;"
				role="link" 
				tabindex="0" 
				on:click={() => goToPost(post.id)} 
				on:keydown={(event) => (event.key === "Enter" || event.key === " ") && goToPost(post.id)}
			>
				<div class="mb-4 flex items-start justify-between gap-4">
					<div class="min-w-0 flex-1">
						<div class="mb-2 flex flex-wrap items-center gap-2">
							{#if post.isPinned}
								<span class="inline-flex items-center gap-1 rounded-lg border border-[var(--primary)] bg-[var(--primary)]/12 px-2.5 py-1 text-xs font-medium text-[var(--primary)]" title="置顶帖子" aria-label="置顶帖子">
									<Icon icon="material-symbols:keep-rounded" />
									<span>置顶</span>
								</span>
							{/if}
							<h2 class="text-lg font-bold text-white transition group-hover:text-[var(--primary)]">{post.title}</h2>
						</div>
						{#if post.excerpt}
							<p class="line-clamp-2 text-sm text-white/55">{post.excerpt}</p>
						{/if}
					</div>
					<div class="flex flex-wrap items-center justify-end gap-2">
						{#if post.category?.name}
							<span class="shrink-0 rounded-full bg-white/8 px-3 py-1 text-xs text-[var(--primary)]">{post.category.name}</span>
						{/if}
					</div>
				</div>
				{#if post.coverImageUrl}
					<div class="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
						<img
							src={post.coverImageUrl}
							alt={`${post.title} 封面`}
							class="h-48 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
							loading="lazy"
						/>
					</div>
				{/if}
				<div class="mb-4 flex items-center gap-3 text-sm text-white/65">
					{#if post.authorId}
						<button class="flex items-center gap-3 rounded-xl text-left transition hover:text-[var(--primary)]" type="button" on:click={(event) => goToUser(post.authorId, event)}>
							{#if post.author?.avatarUrl}
								<img src={post.author.avatarUrl} alt={post.author.displayName || post.author.username || "用户头像"} class="h-9 w-9 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
							{:else}
								<span class="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/45">
									<Icon icon="material-symbols:person-outline-rounded" />
								</span>
							{/if}
							<div class="min-w-0">
								<div class="truncate font-medium text-white/80">{post.author?.displayName || post.author?.username || "匿名用户"}</div>
								<div class="text-xs text-white/35">{formatForumDateTime(post.updatedAt || post.createdAt)}</div>
							</div>
						</button>
					{:else}
						{#if post.author?.avatarUrl}
							<img src={post.author.avatarUrl} alt={post.author.displayName || post.author.username || "用户头像"} class="h-9 w-9 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
						{:else}
							<span class="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/45">
								<Icon icon="material-symbols:person-outline-rounded" />
							</span>
						{/if}
						<div class="min-w-0">
							<div class="truncate font-medium text-white/80">{post.author?.displayName || post.author?.username || "匿名用户"}</div>
							<div class="text-xs text-white/35">{formatForumDateTime(post.updatedAt || post.createdAt)}</div>
						</div>
					{/if}
				</div>
				<div class="flex flex-wrap items-center gap-4 text-xs text-white/40">
					<span class="flex items-center gap-1"><Icon icon="material-symbols:visibility-outline-rounded" />{post.viewCount || 0}</span>
					<span class="flex items-center gap-1"><Icon icon="material-symbols:chat-bubble-outline-rounded" />{post.commentCount || 0}</span>
					<span class="flex items-center gap-1"><Icon icon="material-symbols:favorite-outline-rounded" />{post.likeCount || 0}</span>
				</div>
			</div>
		{/each}
	{/if}
</div>

<style>
@keyframes fade-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}
</style>

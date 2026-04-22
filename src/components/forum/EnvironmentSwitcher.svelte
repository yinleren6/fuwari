<script lang="ts">
import { FORUM_API_BASE_URLS, forumEnv } from "@/forum/stores/env";
import Icon from "@components/IconSvelte.svelte";
import { get } from "svelte/store";

let currentEnv = get(forumEnv);
let customBaseUrl = FORUM_API_BASE_URLS[currentEnv];
let currentBaseUrl = customBaseUrl;

forumEnv.subscribe((value) => {
	currentEnv = value;
});

forumEnv.customBaseUrl.subscribe((value) => {
	customBaseUrl = value;
});

forumEnv.baseUrl.subscribe((value) => {
	currentBaseUrl = value;
});

function toggleEnv() {
	forumEnv.toggle();
}

function applyCustomBaseUrl() {
	forumEnv.customBaseUrl.set(customBaseUrl);
}

function resetBaseUrl() {
	forumEnv.customBaseUrl.reset(currentEnv);
}
</script>

<details class="rounded-xl border border-white/10 bg-white/5 text-sm text-white/70 group">
	<summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-white/80">
		<div class="flex items-center gap-2 font-medium">
			<Icon icon="material-symbols:cloud-sync-outline-rounded" class="text-lg text-[var(--primary)]" />
			<span>高级设置</span>
		</div>
		<div class="flex items-center gap-2 text-xs text-white/45">
			<span>论坛环境：{currentEnv === "prod" ? "生产" : "开发"}</span>
			<Icon icon="material-symbols:expand-more-rounded" class="text-lg transition-transform group-open:rotate-180" />
		</div>
	</summary>
	<div class="space-y-3 border-t border-white/10 px-4 py-4">
		<div class="flex flex-wrap items-center gap-2">
			<div class="flex items-center gap-2 font-medium text-white/80">
				<span>论坛环境</span>
			</div>
			<button class="rounded-lg px-3 py-1.5 font-bold transition-all {currentEnv === 'prod' ? 'bg-[var(--primary)] text-black/80' : 'bg-white/5 text-white/60'}" on:click={toggleEnv}>
				{currentEnv === "prod" ? "生产" : "开发"}
			</button>
			<span class="text-xs break-all text-white/40">当前：{currentBaseUrl}</span>
		</div>
		<div class="flex flex-col gap-2 md:flex-row md:items-center">
			<input bind:value={customBaseUrl} class="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-[var(--primary)]" placeholder="手动输入论坛 API baseURL，例如 http://127.0.0.1:8787" />
			<div class="flex gap-2">
				<button class="rounded-xl border border-white/10 px-4 py-2 font-bold text-white/75" on:click={applyCustomBaseUrl}>应用</button>
				<button class="rounded-xl border border-white/10 px-4 py-2 font-bold text-white/55" on:click={resetBaseUrl}>重置</button>
			</div>
		</div>
	</div>
</details>

<style>
	button {
		cursor: pointer;
	}

	summary::-webkit-details-marker {
		display: none;
	}
</style>

<script lang="ts">
import {
	type ForumProfilePayload,
	getCurrentUser,
	updateMyProfile,
} from "@/forum/api/auth";
import { forumAuth } from "@/forum/stores/auth";
import { ForumApiError } from "@/forum/types/api";
import type { ForumUser, ForumUserGender } from "@/forum/types/user";
import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
import Icon from "@components/IconSvelte.svelte";
import { onMount } from "svelte";

type GenderOption = {
	value: ForumUserGender;
	label: string;
};

const genderOptions: GenderOption[] = [
	{ value: "male", label: "男" },
	{ value: "female", label: "女" },
	{ value: "other", label: "其他" },
	{ value: "prefer_not_to_say", label: "不方便透露" },
];

const genderValues = new Set<ForumUserGender>(
	genderOptions.map((option) => option.value),
);

let user: ForumUser | null = null;
let loading = true;
let saving = false;

let gender = "";
let bio = "";
let age = "";
let region = "";

function applyUser(nextUser: ForumUser | null) {
	user = nextUser;
	gender = nextUser?.gender || "";
	bio = nextUser?.bio || "";
	age = nextUser?.age !== undefined ? String(nextUser.age) : "";
	region = nextUser?.region || "";
}

function getErrorMessage(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

function normalizeNullableText(value: string, maxLength: number) {
	const normalized = value.trim();
	if (!normalized) {
		return null;
	}
	return normalized.slice(0, maxLength);
}

function validateGender(value: string): ForumUserGender | null {
	if (!value) {
		return null;
	}
	if (genderValues.has(value as ForumUserGender)) {
		return value as ForumUserGender;
	}
	throw new Error("性别选项无效。");
}

function validateAge(value: string) {
	const normalized = value.trim();
	if (!normalized) {
		return null;
	}
	if (!/^\d+$/.test(normalized)) {
		throw new Error("年龄必须是 1 到 150 的整数。");
	}
	const parsed = Number(normalized);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 150) {
		throw new Error("年龄必须是 1 到 150 的整数。");
	}
	return parsed;
}

function buildPayload(): ForumProfilePayload {
	const nextBio = bio.trim();
	const nextRegion = region.trim();
	if (nextBio.length > 500) {
		throw new Error("个人简介不能超过 500 字。");
	}
	if (nextRegion.length > 100) {
		throw new Error("地区不能超过 100 字。");
	}
	return {
		gender: validateGender(gender),
		bio: normalizeNullableText(bio, 500),
		age: validateAge(age),
		region: normalizeNullableText(region, 100),
	};
}

async function refreshSession(statusMessage?: string) {
	const nextUser = await getCurrentUser();
	forumAuth.setSession({
		user: nextUser,
		token: null,
		requiresTotp: false,
	});
	applyUser(nextUser);
	if (statusMessage) {
		emitSuccessToast("个人信息", statusMessage);
	}
	return nextUser;
}

async function loadProfile() {
	loading = true;
	try {
		await refreshSession();
	} catch (error) {
		if (error instanceof ForumApiError && error.status === 401) {
			forumAuth.clear();
		}
		console.error(error);
		applyUser(null);
	} finally {
		loading = false;
	}
}

async function saveProfile() {
	if (!user || saving) return;
	let payload: ForumProfilePayload;
	try {
		payload = buildPayload();
	} catch (error) {
		emitErrorToast("个人信息", getErrorMessage(error, "资料校验失败。"));
		return;
	}
	saving = true;
	try {
		await updateMyProfile(payload);
		await refreshSession("个人信息已更新。");
	} catch (error) {
		emitErrorToast("个人信息", getErrorMessage(error, "保存个人信息失败。"));
	} finally {
		saving = false;
	}
}

onMount(() => {
	void loadProfile();
});
</script>

<div class="space-y-6">
	<div class="card-base p-6 md:p-8 space-y-5">
		<div class="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<div class="flex items-center gap-2 mb-2">
					<Icon icon="material-symbols:badge-outline-rounded" class="text-3xl text-[var(--primary)]" />
					<h1 class="text-2xl font-bold text-white">个人信息</h1>
				</div>
				<p class="text-sm text-white/45">编辑论坛扩展资料，包括性别、简介、年龄与地区。</p>
			</div>
			<div class="flex flex-wrap gap-3">
				<a href="/forum/me/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70">返回个人设置</a>
				<a href="/forum/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/60">返回论坛首页</a>
			</div>
		</div>

		{#if loading}
			<p class="text-white/50">正在加载个人信息...</p>
		{:else if !user}
			<div class="rounded-xl border border-white/10 bg-white/5 p-5 text-white/55">
				<p class="mb-3">当前尚未登录，无法查看个人信息。</p>
				<a href="/forum/auth/login/" class="text-[var(--primary)]">前往登录</a>
			</div>
		{:else}
			<div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
				<section class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
					<h2 class="text-lg font-bold text-white">扩展资料</h2>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<label class="text-sm text-white/65" for="forum-me-profile-gender">性别</label>
							<select id="forum-me-profile-gender" bind:value={gender} class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]">
								<option value="">未设置</option>
								{#each genderOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</div>
						<div class="space-y-2">
							<label class="text-sm text-white/65" for="forum-me-profile-age">年龄</label>
							<input id="forum-me-profile-age" bind:value={age} inputmode="numeric" maxlength="3" class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="留空表示未设置" />
						</div>
					</div>
					<div class="space-y-2">
						<label class="text-sm text-white/65" for="forum-me-profile-region">地区</label>
						<input id="forum-me-profile-region" bind:value={region} maxlength="100" class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="例如：上海" />
						<p class="text-xs text-white/40">最多 100 字，留空表示未设置。</p>
					</div>
					<div class="space-y-2">
						<label class="text-sm text-white/65" for="forum-me-profile-bio">个人简介</label>
						<textarea id="forum-me-profile-bio" bind:value={bio} maxlength="500" rows="6" class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="介绍一下你自己"></textarea>
						<div class="flex justify-between text-xs text-white/40">
							<span>最多 500 字，空内容会按未设置提交。</span>
							<span>{bio.trim().length}/500</span>
						</div>
					</div>
					<button class="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-black/80 disabled:opacity-60" disabled={saving} on:click={saveProfile}>{saving ? "保存中..." : "保存个人信息"}</button>
				</section>

				<aside class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
					<h2 class="text-lg font-bold text-white">当前资料预览</h2>
					<div class="space-y-3 text-sm text-white/65">
						<div>
							<div class="text-white/40">用户名</div>
							<div class="mt-1 font-bold text-white">{user.displayName || user.username}</div>
						</div>
						<div>
							<div class="text-white/40">性别</div>
							<div class="mt-1 text-white">{genderOptions.find((option) => option.value === user.gender)?.label || "未设置"}</div>
						</div>
						<div>
							<div class="text-white/40">年龄</div>
							<div class="mt-1 text-white">{user.age ?? "未设置"}</div>
						</div>
						<div>
							<div class="text-white/40">地区</div>
							<div class="mt-1 text-white">{user.region || "未设置"}</div>
						</div>
						<div>
							<div class="text-white/40">个人简介</div>
							<div class="mt-1 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white/85">{user.bio || "未设置"}</div>
						</div>
						<div>
							<div class="text-white/40">文章推送通知</div>
							<div class="mt-1">{user.articleNotifications ? "已开启" : "已关闭"}</div>
						</div>
					</div>
				</aside>
			</div>
		{/if}
	</div>
</div>

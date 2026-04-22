<script lang="ts">
import { login } from "@/forum/api/auth";
import { getForumConfig } from "@/forum/api/config";
import { forumAuth } from "@/forum/stores/auth";
import { ForumApiError } from "@/forum/types/api";
import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
import Icon from "@components/IconSvelte.svelte";
import { onMount } from "svelte";

let email = "";
let password = "";
let totpCode = "";
let loading = false;
let status = "";
let turnstileEnabled = false;

async function loadConfig() {
	try {
		const config = await getForumConfig();
		turnstileEnabled = config.turnstileEnabled;
	} catch {
		turnstileEnabled = false;
	}
}

async function submit() {
	loading = true;
	status = "登录中...";

	try {
		const session = await login({
			email,
			password,
			totpCode: totpCode || undefined,
		});
		forumAuth.setSession(session);
		if (session.requiresTotp) {
			emitErrorToast("登录", "检测到需要二步验证，请填写 TOTP 验证码后重试。");
			return;
		}
		emitSuccessToast("登录", "登录成功，正在跳转...", true);
		window.location.href = "/forum/";
	} catch (error) {
		if (error instanceof ForumApiError && error.message === "TOTP_REQUIRED") {
			emitErrorToast("登录", "检测到需要二步验证，请填写 TOTP 验证码后重试。");
			return;
		}
		emitErrorToast(
			"登录",
			error instanceof Error ? error.message : "登录失败，请稍后再试。",
		);
	} finally {
		loading = false;
	}
}

onMount(() => {
	loadConfig();
});
</script>

<div class="card-base mx-auto max-w-2xl p-6 md:p-8">
	<div class="mb-6 flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<div class="mb-2 flex items-center gap-2">
				<Icon icon="material-symbols:login-rounded" class="text-3xl text-[var(--primary)]" />
				<h1 class="text-2xl font-bold text-white">登录论坛</h1>
			</div>
			<p class="text-sm text-white/45">当前后端使用邮箱 + 密码登录，已兼容 TOTP_REQUIRED 分支。</p>
		</div>
		<div class="flex flex-wrap gap-3">
			<a href="/forum/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/60">返回论坛首页</a>
		</div>
	</div>

	<div class="space-y-4">
		<input bind:value={email} type="email" class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="邮箱" />
		<input bind:value={password} type="password" class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="密码" />
		<input bind:value={totpCode} class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="TOTP 验证码（如需要）" />
		{#if turnstileEnabled}
			<div class="rounded-xl border border-dashed border-white/10 bg-white/5 px-4 py-3 text-sm text-white/45">当前论坛配置已启用 Turnstile，后续可在此挂载验证码组件。</div>
		{/if}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<button class="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-black/80 disabled:opacity-60" disabled={loading} on:click={submit}>登录</button>
			<a href="/forum/auth/forgot-password/" class="text-sm text-[var(--primary)]">忘记密码？</a>
			<a href="/forum/auth/register/" class="text-sm text-[var(--primary)]">没有账号？去注册</a>
		</div>
		{#if status}
			<p class="text-sm text-white/55">{status}</p>
		{/if}
	</div>
</div>

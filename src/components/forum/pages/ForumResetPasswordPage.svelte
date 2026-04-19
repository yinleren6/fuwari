<script lang="ts">
import { resetPassword } from "@/forum/api/auth";
import { getForumConfig } from "@/forum/api/config";
import { ForumApiError } from "@/forum/types/api";
import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
import Icon from "@components/IconSvelte.svelte";
import { onMount } from "svelte";

let token = "";
let newPassword = "";
let totpCode = "";
let loading = false;
let status = "";
let turnstileEnabled = false;

function readTokenFromUrl() {
	if (typeof window === "undefined") {
		return "";
	}
	return new URLSearchParams(window.location.search).get("token") || "";
}

async function loadConfig() {
	try {
		const config = await getForumConfig();
		turnstileEnabled = config.turnstileEnabled;
	} catch {
		turnstileEnabled = false;
	}
}

async function submit() {
	if (!token.trim()) {
		emitErrorToast("重置密码", "缺少重置 token。");
		return;
	}
	if (newPassword.length < 8 || newPassword.length > 16) {
		emitErrorToast("重置密码", "新密码长度需为 8-16 个字符。");
		return;
	}
	loading = true;
	status = "正在重置密码...";
	try {
		await resetPassword({
			token: token.trim(),
			newPassword,
			totpCode: totpCode.trim() || undefined,
		});
		emitSuccessToast("重置密码", "密码已重置，正在前往登录页...", true);
		window.location.href = "/forum/auth/login/";
	} catch (error) {
		if (error instanceof ForumApiError && error.message === "TOTP_REQUIRED") {
			emitErrorToast(
				"重置密码",
				"该账号已开启二步验证，请填写 TOTP 验证码后重试。",
			);
			return;
		}
		emitErrorToast(
			"重置密码",
			error instanceof Error ? error.message : "重置失败，请稍后重试。",
		);
	} finally {
		loading = false;
	}
}

onMount(() => {
	token = readTokenFromUrl();
	loadConfig();
});
</script>

<div class="card-base mx-auto max-w-2xl space-y-4 p-6 md:p-8">
	<div class="mb-2 border-b border-white/10 pb-6">
		<div class="mb-2 flex items-center gap-2">
			<Icon icon="material-symbols:key-reset-rounded" class="text-3xl text-[var(--primary)]" />
			<h1 class="text-2xl font-bold text-white">重置密码</h1>
		</div>
	</div>
	<div class="space-y-2">
		<label class="text-sm text-white/65">重置 token</label>
		<input bind:value={token} class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="粘贴邮件中的 token" />
	</div>
	<div class="space-y-2">
		<label class="text-sm text-white/65">新密码 (8-16 字符)</label>
		<input bind:value={newPassword} type="password" minlength="8" maxlength="16" class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="输入新密码" />
	</div>
	<div class="space-y-2">
		<label class="text-sm text-white/65">TOTP 验证码（如需要）</label>
		<input bind:value={totpCode} class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="账号开启 2FA 时填写" />
	</div>
	{#if turnstileEnabled}
		<div class="rounded-xl border border-dashed border-white/10 bg-white/5 px-4 py-3 text-sm text-white/45">当前论坛配置已启用 Turnstile，前端暂未挂载验证码组件，直接提交可能会被后端拦截。</div>
	{/if}
	<div class="space-y-3">
		<button class="w-full rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-black/80 disabled:opacity-60" disabled={loading} on:click={submit}>重置密码</button>
		<div class="flex items-center justify-center gap-4 text-sm">
			<a href="/forum/auth/login/" class="text-[var(--primary)]">返回登录</a>
			<a href="/forum/auth/forgot-password/" class="text-[var(--primary)]">重新申请邮件</a>
		</div>
	</div>
	{#if status}
		<p class="text-sm text-white/55">{status}</p>
	{/if}
</div>

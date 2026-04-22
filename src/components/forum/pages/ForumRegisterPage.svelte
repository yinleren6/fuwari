<script lang="ts">
import { register } from "@/forum/api/auth";
import { getForumConfig } from "@/forum/api/config";
import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
import Icon from "@components/IconSvelte.svelte";
import { onMount } from "svelte";

let username = "";
let email = "";
let password = "";
let status = "";
let loading = false;
let turnstileEnabled = false;
let allowRegistration = true;

async function loadConfig() {
	try {
		const config = await getForumConfig();
		turnstileEnabled = config.turnstileEnabled;
		allowRegistration = config.allowRegistration !== false;
	} catch {
		turnstileEnabled = false;
		allowRegistration = true;
	}
}

function validateForm() {
	const trimmedUsername = username.trim();
	const trimmedEmail = email.trim();

	if (!allowRegistration) {
		return "当前论坛暂未开放注册。";
	}
	if (!trimmedUsername || !trimmedEmail || !password) {
		return "请填写用户名、邮箱和密码。";
	}
	if (trimmedUsername.length > 20) {
		return "用户名最多 20 个字符。";
	}
	if (trimmedEmail.length > 50) {
		return "邮箱最多 50 个字符。";
	}
	if (password.length < 8 || password.length > 16) {
		return "密码长度需为 8-16 个字符。";
	}
	return "";
}

async function submit() {
	const validationMessage = validateForm();
	if (validationMessage) {
		emitErrorToast("注册", validationMessage);
		return;
	}

	loading = true;
	status = "注册中...";
	try {
		const result = await register({
			username: username.trim(),
			email: email.trim(),
			password,
		});
		emitSuccessToast(
			"注册",
			result.message || "注册成功，请前往邮箱完成验证。",
			true,
		);
		window.location.href = "/forum/auth/login/";
	} catch (error) {
		emitErrorToast(
			"注册",
			error instanceof Error ? error.message : "注册失败，请稍后重试。",
		);
	} finally {
		loading = false;
	}
}

onMount(() => {
	loadConfig();
});
</script>

<div class="card-base mx-auto max-w-2xl space-y-4 p-6 md:p-8">
	<div class="mb-2 border-b border-white/10 pb-6">
		<div class="mb-2 flex items-center gap-2">
			<Icon icon="material-symbols:person-add-rounded" class="text-3xl text-[var(--primary)]" />
			<h1 class="text-2xl font-bold text-white">注册</h1>
		</div>
	</div>
	<div class="space-y-2">
		<label class="text-sm text-white/65">用户名 (最多 20 字符)</label>
		<input bind:value={username} maxlength="20" class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="用户名" />
	</div>
	<div class="space-y-2">
		<label class="text-sm text-white/65">邮箱</label>
		<input bind:value={email} type="email" maxlength="50" class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="邮箱" />
	</div>
	<div class="space-y-2">
		<label class="text-sm text-white/65">密码 (8-16 字符)</label>
		<input bind:value={password} type="password" minlength="8" maxlength="16" class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="密码" />
	</div>
	{#if turnstileEnabled}
		<div class="rounded-xl border border-dashed border-white/10 bg-white/5 px-4 py-3 text-sm text-white/45">当前论坛配置已启用 Turnstile，前端暂未挂载验证码组件，直接注册可能会被后端拦截。</div>
	{/if}
	<div class="space-y-3">
		<button class="w-full rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-black/80 disabled:opacity-60" disabled={loading || !allowRegistration} on:click={submit}>注册</button>
		<a href="/forum/auth/login/" class="block text-center text-sm text-[var(--primary)]">已有账号？登录</a>
	</div>
	{#if status}
		<p class="text-sm text-white/55">{status}</p>
	{/if}
</div>

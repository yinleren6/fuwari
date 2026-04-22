<script lang="ts">
import { forgotPassword } from "@/forum/api/auth";
import { getForumConfig } from "@/forum/api/config";
import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
import Icon from "@components/IconSvelte.svelte";
import { onMount } from "svelte";

let email = "";
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
	if (!email.trim()) {
		emitErrorToast("找回密码", "请先填写邮箱。");
		return;
	}
	loading = true;
	status = "正在发送重置邮件...";
	try {
		await forgotPassword({ email: email.trim() });
		emitSuccessToast(
			"找回密码",
			"如果该邮箱已注册，重置密码邮件已发送，请注意查收。",
		);
	} catch (error) {
		emitErrorToast(
			"找回密码",
			error instanceof Error ? error.message : "发送失败，请稍后重试。",
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
			<Icon icon="material-symbols:mail-lock-outline-rounded" class="text-3xl text-[var(--primary)]" />
			<h1 class="text-2xl font-bold text-white">找回密码</h1>
		</div>
	</div>
	<div class="space-y-2">
		<label class="text-sm text-white/65">邮箱</label>
		<input bind:value={email} type="email" maxlength="50" class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="输入注册邮箱" />
	</div>
	{#if turnstileEnabled}
		<div class="rounded-xl border border-dashed border-white/10 bg-white/5 px-4 py-3 text-sm text-white/45">当前论坛配置已启用 Turnstile，前端暂未挂载验证码组件，直接提交可能会被后端拦截。</div>
	{/if}
	<div class="space-y-3">
		<button class="w-full rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-black/80 disabled:opacity-60" disabled={loading} on:click={submit}>发送重置邮件</button>
		<div class="flex items-center justify-center gap-4 text-sm">
			<a href="/forum/auth/login/" class="text-[var(--primary)]">返回登录</a>
			<a href="/forum/auth/reset-password/" class="text-[var(--primary)]">已有 token？去重置</a>
		</div>
	</div>
	{#if status}
		<p class="text-sm text-white/55">{status}</p>
	{/if}
</div>

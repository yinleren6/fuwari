<script lang="ts">
import ForumSkeleton from "@/components/forum/ForumSkeleton.svelte";
import {
	changeEmail,
	deleteAccount,
	disableTotp,
	getCurrentUser,
	logout,
	setupTotp,
	updateProfile,
	uploadAvatar,
	verifyEmailChange,
	verifyTotp,
} from "@/forum/api/auth";
import { forumAuth } from "@/forum/stores/auth";
import type { ForumUser } from "@/forum/types/user";
import { compressAvatarImage } from "@/forum/utils/image-compression";
import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
import Icon from "@components/IconSvelte.svelte";
import QRCode from "qrcode";
import { onMount } from "svelte";

let user: ForumUser | null = null;
let loading = true;
let contentVisible = false;
let savingProfile = false;
let changingEmail = false;
let settingTotp = false;
let deletingAccount = false;

let username = "";
let avatarUrl = "";
let emailNotifications = true;
let articleNotifications = false;

let emailCurrent = "";
let emailTotp = "";

let totpSecret = "";
let totpUri = "";
let totpQrDataUrl = "";
let totpCode = "";
let disableTotpPassword = "";
let disableTotpCode = "";

let deletePassword = "";
let deleteTotp = "";
let avatarFileInput: HTMLInputElement | null = null;

function triggerAvatarUpload() {
	avatarFileInput?.click();
}

function isAdminUser(nextUser: ForumUser | null) {
	return nextUser?.role === "admin";
}

function applyUser(nextUser: ForumUser | null) {
	user = nextUser;
	username = nextUser?.username || "";
	avatarUrl = nextUser?.avatarUrl || "";
	emailCurrent = nextUser?.email || "";
	emailNotifications = nextUser?.emailNotifications ?? true;
	articleNotifications = nextUser?.articleNotifications ?? false;
}

function resolveSecurityStatus(nextUser: ForumUser | null) {
	if (!nextUser) {
		return "未登录";
	}
	const parts: string[] = [];
	if (nextUser.verified !== undefined) {
		parts.push(nextUser.verified ? "邮箱已验证" : "邮箱未验证");
	}
	parts.push(
		nextUser.totpEnabled === undefined
			? "2FA 状态未知"
			: nextUser.totpEnabled
				? "2FA 已启用"
				: "2FA 未启用",
	);
	return parts.join(" · ");
}

function validateUsername(value: string) {
	const normalized = value.trim();
	if (!normalized) {
		return "用户名不能为空。";
	}
	if (normalized.length > 20) {
		return "用户名不能超过 20 个字符。";
	}
	if (/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/.test(normalized)) {
		return "用户名不能包含控制字符或不可见字符。";
	}
	if (!/^[A-Za-z0-9_.\-\u4e00-\u9fa5]+$/.test(normalized)) {
		return "用户名只能包含中文、字母、数字、点、下划线或连字符。";
	}
	return null;
}

function getErrorMessage(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

function normalizeTotpUriTitle(uri: string) {
	try {
		const parsed = new URL(uri);
		if (parsed.protocol !== "otpauth:") {
			return uri;
		}
		const accountName = parsed.pathname.startsWith("/")
			? parsed.pathname.slice(1).split(":").slice(1).join(":")
			: "";
		parsed.pathname = `/${encodeURIComponent(`AcoFork Forum${accountName ? `:${accountName}` : ""}`)}`;
		parsed.searchParams.set("issuer", "AcoFork Forum");
		return parsed.toString();
	} catch {
		return uri;
	}
}

async function generateTotpQrDataUrl(uri: string) {
	return QRCode.toDataURL(uri, {
		width: 224,
		margin: 1,
		errorCorrectionLevel: "M",
	});
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
		emitSuccessToast("个人设置", statusMessage);
	}
	return nextUser;
}

async function loadSession() {
	loading = true;
	try {
		const params = new URLSearchParams(window.location.search);
		const emailChangeToken =
			params.get("email_change_token") || params.get("token");
		if (emailChangeToken) {
			try {
				const verifyResult = await verifyEmailChange(emailChangeToken);
				emitSuccessToast(
					"邮箱变更",
					verifyResult.message || "邮箱变更已确认。",
					false,
				);
			} catch (error) {
				emitErrorToast("邮箱变更", getErrorMessage(error, "邮箱确认失败。"));
			}
			params.delete("email_change_token");
			params.delete("token");
			const nextQuery = params.toString();
			window.history.replaceState(
				{},
				"",
				nextQuery ? `?${nextQuery}` : window.location.pathname,
			);
		}

		await refreshSession();
	} catch (error) {
		console.error(error);
		applyUser(null);
	} finally {
		loading = false;
		contentVisible = true;
	}
}

async function saveProfile() {
	if (!user || savingProfile) return;
	const normalizedUsername = username.trim();
	const normalizedAvatarUrl = avatarUrl.trim();
	const usernameError = validateUsername(normalizedUsername);
	if (usernameError) {
		emitErrorToast("个人设置", usernameError);
		return;
	}
	savingProfile = true;
	try {
		await updateProfile({
			username: normalizedUsername,
			avatarUrl: normalizedAvatarUrl || "",
			emailNotifications,
			articleNotifications,
		});
		avatarUrl = normalizedAvatarUrl;
		await refreshSession("资料已更新。");
	} catch (error) {
		emitErrorToast("个人设置", getErrorMessage(error, "资料更新失败。"));
	} finally {
		savingProfile = false;
	}
}

async function handleAvatarUpload(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	const file = input.files?.[0];
	input.value = "";
	if (!file || !user) return;
	try {
		let uploadFileTarget = file;
		try {
			uploadFileTarget = await compressAvatarImage(file);
		} catch {
			uploadFileTarget = file;
		}
		const uploadedUrl = await uploadAvatar(uploadFileTarget);
		avatarUrl = uploadedUrl;
		emitSuccessToast("头像设置", "头像上传成功，请记得保存资料。");
	} catch (error) {
		emitErrorToast("头像设置", getErrorMessage(error, "头像上传失败。"));
	}
}

async function requestEmailChange() {
	if (!user || changingEmail) return;
	changingEmail = true;
	try {
		const result = await changeEmail({
			newEmail: emailCurrent.trim(),
			totpCode: emailTotp.trim() || undefined,
		});
		emailTotp = "";
		await refreshSession(
			result.message || "确认邮件已发送至新邮箱，请前往查收。",
		);
	} catch (error) {
		emitErrorToast("邮箱变更", getErrorMessage(error, "邮箱变更失败。"));
	} finally {
		changingEmail = false;
	}
}

async function startTotpSetup() {
	if (!user || settingTotp) return;
	settingTotp = true;
	try {
		const result = await setupTotp();
		totpSecret = result.secret;
		totpUri = normalizeTotpUriTitle(result.uri);
		totpQrDataUrl = "";
		if (totpUri) {
			try {
				totpQrDataUrl = await generateTotpQrDataUrl(totpUri);
			} catch {
				emitErrorToast(
					"双重验证（2FA）",
					"二维码生成失败，请改用下方密钥或 URI 手动添加。",
				);
			}
		}
		emitSuccessToast(
			"双重验证（2FA）",
			"请使用验证器录入密钥后输入验证码完成启用。",
			false,
		);
	} catch (error) {
		emitErrorToast(
			"双重验证（2FA）",
			getErrorMessage(error, "2FA 初始化失败。"),
		);
	} finally {
		settingTotp = false;
	}
}

async function confirmTotp() {
	if (!user || settingTotp) return;
	settingTotp = true;
	try {
		await verifyTotp({ token: totpCode.trim() });
		totpSecret = "";
		totpUri = "";
		totpQrDataUrl = "";
		totpCode = "";
		await refreshSession("2FA 已启用。");
	} catch (error) {
		emitErrorToast("双重验证（2FA）", getErrorMessage(error, "2FA 验证失败。"));
	} finally {
		settingTotp = false;
	}
}

async function submitDisableTotp() {
	if (!user || settingTotp) return;
	const password = disableTotpPassword;
	const code = disableTotpCode.trim();
	if (!password) {
		emitErrorToast("双重验证（2FA）", "请输入当前密码。");
		return;
	}
	if (!code) {
		emitErrorToast("双重验证（2FA）", "请输入当前 TOTP 验证码。");
		return;
	}
	settingTotp = true;
	try {
		await disableTotp({ password, totpCode: code });
		disableTotpPassword = "";
		disableTotpCode = "";
		totpSecret = "";
		totpUri = "";
		totpQrDataUrl = "";
		totpCode = "";
		await refreshSession("2FA 已关闭。");
	} catch (error) {
		emitErrorToast(
			"双重验证（2FA）",
			getErrorMessage(error, "关闭 2FA 失败。"),
		);
	} finally {
		settingTotp = false;
	}
}

async function submitDeleteAccount() {
	if (!user || deletingAccount) return;
	if (!window.confirm("确定要注销账号吗？此操作无法撤销。")) return;
	deletingAccount = true;
	try {
		await deleteAccount({
			password: deletePassword,
			totpCode: deleteTotp.trim() || undefined,
		});
		forumAuth.clear();
		window.location.href = "/forum/";
	} catch (error) {
		emitErrorToast("账号安全", getErrorMessage(error, "账号注销失败。"));
	} finally {
		deletingAccount = false;
	}
}

async function submitLogout() {
	try {
		await logout();
	} catch {
		// ignore api logout error and still clear local session
	}
	forumAuth.clear();
	window.location.href = "/forum/auth/login/";
}

onMount(() => {
	loadSession();
});
</script>

<div class="space-y-6">
	<div class="card-base p-6 md:p-8 space-y-5">
		<div class="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<div class="flex items-center gap-2 mb-2">
					<Icon icon="material-symbols:account-circle-outline-rounded" class="text-3xl text-[var(--primary)]" />
					<h1 class="text-2xl font-bold text-white">个人设置</h1>
				</div>
				<p class="text-sm text-white/45">集中管理论坛资料、邮箱、2FA 与账号安全。</p>
			</div>
			<div class="flex flex-wrap gap-3">
				<a href="/forum/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/60">返回论坛首页</a>
				{#if user?.id}
					<a href={`/forum/u/?id=${encodeURIComponent(user.id)}`} class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70">查看我的公开主页</a>
				{/if}
				{#if user}
					<a href="/forum/me/profile/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70">个人信息</a>
				{/if}
				{#if isAdminUser(user)}
					<a href="/forum/admin/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70">进入管理控制台</a>
				{/if}
				{#if user}
					<button class="rounded-xl border border-red-200/20 px-4 py-3 text-sm font-bold text-red-200" on:click={submitLogout}>退出登录</button>
				{/if}
			</div>
		</div>

		{#if loading}
			<div class="transition-opacity duration-200">
				<ForumSkeleton type="me" />
			</div>
		{:else if !user}
			<div class="transition-opacity duration-200" class:opacity-0={!contentVisible} class:opacity-100={contentVisible}>
				<div class="rounded-xl border border-white/10 bg-white/5 p-5 text-white/55">
					<p class="mb-3">当前尚未登录，无法查看论坛个人资料。</p>
					<a href="/forum/auth/login/" class="text-[var(--primary)]">前往登录</a>
				</div>
			</div>
		{:else}
			<div 
				class="grid gap-6 lg:grid-cols-2 transition-opacity duration-200"
				class:opacity-0={!contentVisible}
				class:opacity-100={contentVisible}
			>
				<section class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
					<h2 class="text-lg font-bold text-white">基础资料</h2>
					<div class="rounded-xl border border-white/10 bg-black/20 p-4">
						<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
							<button type="button" class="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5 text-white/35" on:click={triggerAvatarUpload} title="点击上传新头像">
								{#if avatarUrl}
									<img src={avatarUrl} alt="当前头像" class="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" referrerpolicy="no-referrer" />
								{:else}
									<div class="flex h-full w-full items-center justify-center">
										<Icon icon="material-symbols:person-outline-rounded" class="text-4xl" />
									</div>
								{/if}
								<div class="absolute inset-0 flex items-center justify-center bg-black/45 text-[11px] font-bold text-white opacity-0 transition group-hover:opacity-100">点击上传</div>
							</button>
							<div class="min-w-0 flex-1 space-y-2">
								<input id="forum-profile-avatar-file" bind:this={avatarFileInput} type="file" accept="image/*" class="hidden" on:change={handleAvatarUpload} />
								<label class="text-sm text-white/65" for="forum-profile-avatar-url">头像 URL</label>
								<input id="forum-profile-avatar-url" bind:value={avatarUrl} class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" />
								<p class="text-xs text-white/40">留空表示使用默认头像。</p>
							</div>
						</div>
					</div>
					<div class="space-y-2">
						<label class="text-sm text-white/65" for="forum-profile-username">用户名</label>
						<input id="forum-profile-username" bind:value={username} class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" maxlength="20" />
					</div>
					<label class="flex items-center gap-2 text-sm text-white/65">
						<input type="checkbox" bind:checked={emailNotifications} />
						接收论坛邮件通知
					</label>
					<label class="flex items-center gap-2 text-sm text-white/65">
						<input type="checkbox" bind:checked={articleNotifications} />
						接收博客文章推送通知
					</label>
					<button class="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-black/80 disabled:opacity-60" disabled={savingProfile} on:click={saveProfile}>{savingProfile ? "保存中..." : "保存资料"}</button>
				</section>

				<section class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
					<h2 class="text-lg font-bold text-white">邮箱变更</h2>
					<p class="text-sm text-white/45">提交后，确认链接会发送到填写的邮箱地址。</p>
					<div class="space-y-2">
						<label class="text-sm text-white/65" for="forum-email-current">编辑邮箱地址</label>
						<input id="forum-email-current" bind:value={emailCurrent} type="email" class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" />
					</div>
					<div class="space-y-2">
						<label class="text-sm text-white/65" for="forum-email-totp">TOTP 验证码（如已启用）</label>
						<input id="forum-email-totp" bind:value={emailTotp} inputmode="numeric" maxlength="6" class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" />
					</div>
					<button class="rounded-xl border border-white/10 px-5 py-3 font-bold text-white/80 disabled:opacity-60" disabled={changingEmail} on:click={requestEmailChange}>{changingEmail ? "提交中..." : "发送确认邮件"}</button>
				</section>

				<section class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
					<h2 class="text-lg font-bold text-white">双重验证（2FA / TOTP）</h2>
					{#if user.totpEnabled}
						<div class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">当前账号已启用 2FA。</div>
					<div class="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
						<p class="text-sm text-white/60">关闭 2FA 需要同时验证当前密码和当前 TOTP 验证码。</p>
						<div class="space-y-2">
							<label class="text-sm text-white/65" for="forum-disable-totp-password">当前密码</label>
							<input id="forum-disable-totp-password" bind:value={disableTotpPassword} type="password" class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" />
						</div>
						<div class="space-y-2">
							<label class="text-sm text-white/65" for="forum-disable-totp-code">当前 TOTP 验证码</label>
							<input id="forum-disable-totp-code" bind:value={disableTotpCode} inputmode="numeric" maxlength="6" class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="输入 6 位验证码" />
						</div>
						<button class="rounded-xl border border-red-300/20 bg-red-400/10 px-5 py-3 font-bold text-red-100 disabled:opacity-60" disabled={settingTotp} on:click={submitDisableTotp}>{settingTotp ? "处理中..." : "关闭 2FA"}</button>
					</div>
					{:else}
						<p class="text-sm text-white/45">启用 2FA 后，登录与敏感操作将可使用动态验证码保护。</p>
						<button class="rounded-xl border border-white/10 px-5 py-3 font-bold text-white/80 disabled:opacity-60" disabled={settingTotp} on:click={startTotpSetup}>{settingTotp ? "准备中..." : "开始启用 2FA"}</button>
						{#if totpSecret}
							<div class="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
								<p class="text-sm text-white/60">请使用验证器扫描二维码，或手动录入下方密钥 / otpauth URI。</p>
								{#if totpQrDataUrl}
									<div class="flex justify-center">
										<div class="rounded-2xl bg-white p-3 shadow-sm">
											<img src={totpQrDataUrl} alt="2FA 二维码" class="h-56 w-56 rounded-xl object-contain" loading="lazy" />
										</div>
									</div>
								{/if}
								<div>
									<div class="text-xs uppercase tracking-wide text-white/35">Secret</div>
									<div class="mt-1 break-all rounded-lg bg-white/5 px-3 py-2 font-mono text-sm text-white/80">{totpSecret}</div>
								</div>
								{#if totpUri}
									<div>
										<div class="text-xs uppercase tracking-wide text-white/35">URI</div>
										<div class="mt-1 break-all rounded-lg bg-white/5 px-3 py-2 font-mono text-xs text-white/60">{totpUri}</div>
									</div>
								{/if}
								<input bind:value={totpCode} inputmode="numeric" maxlength="6" class="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="输入 6 位验证码" />
								<button class="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-black/80 disabled:opacity-60" disabled={settingTotp} on:click={confirmTotp}>{settingTotp ? "验证中..." : "验证并启用"}</button>
							</div>
						{/if}
					{/if}
				</section>

				<section class="rounded-2xl border border-red-400/20 bg-red-400/5 p-5 space-y-4">
					<h2 class="text-lg font-bold text-red-200">危险区域</h2>
					<p class="text-sm text-red-100/70">注销账号后，当前论坛账号数据无法恢复。</p>
					<div class="space-y-2">
						<label class="text-sm text-red-100/70" for="forum-delete-password">当前密码</label>
						<input id="forum-delete-password" bind:value={deletePassword} type="password" class="w-full rounded-xl border border-red-200/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-red-300/50" />
					</div>
					<div class="space-y-2">
						<label class="text-sm text-red-100/70" for="forum-delete-totp">TOTP 验证码（如已启用）</label>
						<input id="forum-delete-totp" bind:value={deleteTotp} inputmode="numeric" maxlength="6" class="w-full rounded-xl border border-red-200/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-red-300/50" />
					</div>
					<button class="rounded-xl bg-red-400 px-5 py-3 font-bold text-black/80 disabled:opacity-60" disabled={deletingAccount} on:click={submitDeleteAccount}>{deletingAccount ? "处理中..." : "注销账号"}</button>
				</section>
			</div>
		{/if}
	</div>
</div>

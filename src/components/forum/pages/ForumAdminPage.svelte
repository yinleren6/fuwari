<script lang="ts">
import {
	cleanupAdminStorageGc,
	createAdminCategory,
	deleteAdminCategory,
	deleteAdminUser,
	getAdminCategories,
	getAdminSettings,
	getAdminStats,
	getAdminUsers,
	getArticleNotificationsCount,
	resendAdminUserVerification,
	saveAdminSettings,
	scanAdminStorageGc,
	sendAdminTestEmail,
	updateAdminCategory,
	updateAdminUser,
	verifyAdminUser,
} from "@/forum/api/admin";
import { getSession } from "@/forum/api/auth";
import { forumAuth } from "@/forum/stores/auth";
import { forumEnv } from "@/forum/stores/env";
import type {
	AdminEmailTestResult,
	AdminStats,
	AdminStorageGcScanResult,
	AdminUserUpdatePayload,
	ForumAdminSettings,
} from "@/forum/types/api";
import type { ForumCategory } from "@/forum/types/post";
import type { ForumUser } from "@/forum/types/user";
import { emitErrorToast, emitSuccessToast } from "@/forum/utils/toast";
import Icon from "@components/IconSvelte.svelte";
import { onMount } from "svelte";

const defaultSettings: ForumAdminSettings = {
	turnstileEnabled: false,
	notifyOnUserDelete: false,
	notifyOnPostDelete: false,
	notifyOnUsernameChange: false,
	notifyOnAvatarChange: false,
	notifyOnManualVerify: false,
	sessionTtlDays: 7,
};

function truncateDisplayName(value?: string, maxLength = 10) {
	if (!value) {
		return "";
	}
	return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function formatLastSeen(isoString?: string | null): string {
	if (!isoString) return "从未上线";
	// 后端存储的是 UTC 时间，但 SQLite 的 CURRENT_TIMESTAMP 不带 Z 后缀
	// 需要补上 Z 让 JS 正确按 UTC 解析，否则会被当作本地时间
	const normalized = /[Zz+\-]\d{0,2}:?\d{0,2}$/.test(isoString)
		? isoString
		: `${isoString}Z`;
	const now = Date.now();
	const then = new Date(normalized).getTime();
	if (Number.isNaN(then)) return "未知";
	const diffMs = now - then;
	if (diffMs < 0) return "刚刚";
	const seconds = Math.floor(diffMs / 1000);
	if (seconds < 60) return "刚刚";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}分钟前`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}小时前`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}天前`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}个月前`;
	return `${Math.floor(months / 12)}年前`;
}

let loading = true;
let contentVisible = false;
let refreshing = false;
let status = "";
let currentUser: ForumUser | null = null;
let stats: AdminStats | null = null;
let settings: ForumAdminSettings = { ...defaultSettings };
let users: ForumUser[] = [];
let categories: ForumCategory[] = [];
const emailTemplateOptions = [
	{ value: "smtp_test", label: "SMTP 测试邮件" },
	{ value: "reset_password", label: "密码重置邮件" },
	{ value: "change_email_confirm", label: "更换邮箱确认邮件" },
	{ value: "register_verify", label: "注册验证邮件" },
	{ value: "admin_resend_verify", label: "后台重发验证邮件" },
	{ value: "admin_avatar_updated", label: "后台头像更新通知" },
	{ value: "admin_username_updated", label: "后台用户名更新通知" },
	{ value: "admin_manual_verified", label: "后台手动验证通知" },
	{ value: "admin_account_deleted", label: "后台删号通知" },
	{ value: "post_new_comment", label: "帖子新评论提醒" },
	{ value: "comment_new_reply", label: "评论新回复提醒" },
] as const;

let emailResults: AdminEmailTestResult[] = [];
let newCategoryName = "";
let userSearchQuery = "";
let userSearchSubmitting = false;
let emailTestTo = "";
let emailTestTemplates = emailTemplateOptions.map((item) => item.value);
let emailTesting = false;
let editingCategoryId = "";
let editingCategoryName = "";
let editingUserId = "";
let savingUserId = "";
let editingUserForm = {
	username: "",
	email: "",
	avatarUrl: "",
	password: "",
};
let editingUserOriginal = {
	username: "",
	email: "",
	avatarUrl: "",
};
let userActionBusyId = "";
let userActionType = "";
let storageScanning = false;
let storageCleaning = false;
let storageGcResult: AdminStorageGcScanResult | null = null;
let isAdmin = false;
let currentBaseUrl = "";
let hasToken = false;
let articleNotificationsCount = 0;

async function loadSession() {
	currentBaseUrl = "";
	hasToken = Boolean(forumAuth.getToken());
	forumEnv.baseUrl.subscribe((value) => {
		currentBaseUrl = value;
	})();
	const session = await getSession();
	currentUser = session.user;
}

async function refreshData(showLoading = false) {
	if (showLoading) {
		loading = true;
	} else {
		refreshing = true;
	}
	status = "";
	try {
		const normalizedUserSearch = userSearchQuery.trim();
		const [
			nextStats,
			nextSettings,
			nextUsers,
			nextCategories,
			nextArticleCount,
		] = await Promise.all([
			getAdminStats(),
			getAdminSettings(),
			getAdminUsers(normalizedUserSearch),
			getAdminCategories(),
			getArticleNotificationsCount(),
		]);
		isAdmin = true;
		stats = nextStats;
		settings = nextSettings;
		users = nextUsers;
		categories = nextCategories;
		articleNotificationsCount = nextArticleCount.count;
	} catch (error) {
		isAdmin = false;
		status = "";
		emitErrorToast(
			"管理台",
			error instanceof Error ? error.message : "管理台数据加载失败。",
		);
	} finally {
		loading = false;
		refreshing = false;
		contentVisible = true;
	}
}

async function submitUserSearch() {
	if (loading || refreshing || userSearchSubmitting) {
		return;
	}
	userSearchSubmitting = true;
	status = userSearchQuery.trim() ? "正在搜索用户..." : "正在加载全部用户...";
	try {
		await refreshData();
	} finally {
		userSearchSubmitting = false;
	}
}

function resetUserSearch() {
	if (!userSearchQuery) {
		return;
	}
	userSearchQuery = "";
	void submitUserSearch();
}

async function saveSettingsAction() {
	status = "正在保存设置...";
	try {
		await saveAdminSettings(settings);
		status = "";
		emitSuccessToast("站点设置", "站点设置已保存。", false);
	} catch (error) {
		status = error instanceof Error ? error.message : "站点设置保存失败。";
		emitErrorToast("站点设置", status);
	}
}

async function createCategoryAction() {
	if (!newCategoryName.trim()) return;
	status = "正在添加分类...";
	try {
		await createAdminCategory(newCategoryName.trim());
		newCategoryName = "";
		await refreshData();
		status = "";
		emitSuccessToast("分类管理", "分类已添加。", false);
	} catch (error) {
		status = "";
		emitErrorToast(
			"分类管理",
			error instanceof Error ? error.message : "分类添加失败。",
		);
	}
}

async function saveCategoryAction(id: string) {
	if (!editingCategoryName.trim()) return;
	status = "正在更新分类...";
	try {
		await updateAdminCategory(id, editingCategoryName.trim());
		editingCategoryId = "";
		editingCategoryName = "";
		await refreshData();
		status = "";
		emitSuccessToast("分类管理", "分类已更新。", false);
	} catch (error) {
		status = "";
		emitErrorToast(
			"分类管理",
			error instanceof Error ? error.message : "分类更新失败。",
		);
	}
}

async function deleteCategoryAction(id: string) {
	if (!window.confirm("确定要删除这个分类吗？")) return;
	status = "正在删除分类...";
	try {
		await deleteAdminCategory(id);
		await refreshData();
		status = "";
		emitSuccessToast("分类管理", "分类已删除。", false);
	} catch (error) {
		status = "";
		emitErrorToast(
			"分类管理",
			error instanceof Error ? error.message : "分类删除失败。",
		);
	}
}

function toggleAllEmailTemplates(checked: boolean) {
	emailTestTemplates = checked
		? emailTemplateOptions.map((item) => item.value)
		: [];
}

function isAllEmailTemplatesSelected() {
	return emailTestTemplates.length === emailTemplateOptions.length;
}

async function sendEmailTestAction() {
	if (!emailTestTo.trim() || emailTesting || emailTestTemplates.length === 0)
		return;
	emailTesting = true;
	status = isAllEmailTemplatesSelected()
		? "正在测试全部邮件模板..."
		: `正在发送 ${emailTestTemplates.length} 个测试模板...`;
	try {
		if (isAllEmailTemplatesSelected()) {
			emailResults = await sendAdminTestEmail({
				to: emailTestTo.trim(),
				template: "all",
			});
		} else {
			const resultGroups = await Promise.all(
				emailTestTemplates.map((template) =>
					sendAdminTestEmail({
						to: emailTestTo.trim(),
						template,
					}),
				),
			);
			emailResults = resultGroups.flat();
		}
		status = "";
		if (emailResults.length > 0) {
			emitSuccessToast("邮件测试", "测试邮件已提交。");
		} else {
			emitSuccessToast("邮件测试", "请求已提交，但后端未返回详细结果。");
		}
	} catch (error) {
		emailResults = [];
		status = "";
		emitErrorToast(
			"邮件测试",
			error instanceof Error ? error.message : "测试邮件发送失败。",
		);
	} finally {
		emailTesting = false;
	}
}

function isEditingUser(userId: string) {
	return editingUserId === userId;
}

function startEditUser(user: ForumUser) {
	if (savingUserId) return;
	editingUserId = user.id;
	editingUserForm = {
		username: user.username || "",
		email: user.email || "",
		avatarUrl: user.avatarUrl || "",
		password: "",
	};
	editingUserOriginal = {
		username: (user.username || "").trim(),
		email: (user.email || "").trim(),
		avatarUrl: user.avatarUrl || "",
	};
}

function cancelEditUser(force = false) {
	if (savingUserId && !force) return;
	editingUserId = "";
	editingUserForm = {
		username: "",
		email: "",
		avatarUrl: "",
		password: "",
	};
	editingUserOriginal = {
		username: "",
		email: "",
		avatarUrl: "",
	};
}

function hasUserActionConflict(userId: string) {
	return (
		Boolean(userActionBusyId || savingUserId) ||
		(Boolean(editingUserId) && editingUserId !== userId)
	);
}

function isValidEmail(email: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hasInvisibleUnicode(value: string) {
	return /[\u00A0\u1680\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uFEFF]/u.test(
		value,
	);
}

function hasControlCharacter(value: string) {
	return /[\u0000-\u001F\u007F-\u009F]/u.test(value);
}

function validateUserEditForm() {
	const username = editingUserForm.username.trim();
	const email = editingUserForm.email.trim();
	const avatarUrl = editingUserForm.avatarUrl.trim();
	const password = editingUserForm.password;

	if (!username) {
		return "Username cannot be empty";
	}
	if (username.length > 20) {
		return "Username too long (Max 20 chars)";
	}
	if (hasInvisibleUnicode(username)) {
		return "Username contains invalid invisible characters";
	}
	if (hasControlCharacter(username)) {
		return "Username contains invalid control characters";
	}
	if (email.length > 50) {
		return "Email too long (Max 50 chars)";
	}
	if (email && !isValidEmail(email)) {
		return "请输入有效的邮箱地址。";
	}
	if (password && (password.length < 8 || password.length > 16)) {
		return "Password must be 8-16 characters";
	}

	return "";
}

async function saveUserAction(userId: string) {
	if (!isEditingUser(userId) || savingUserId) return;
	const username = editingUserForm.username.trim();
	const email = editingUserForm.email.trim();
	const avatarUrl = editingUserForm.avatarUrl.trim();
	const password = editingUserForm.password;
	const validationError = validateUserEditForm();

	if (validationError) {
		status = validationError;
		return;
	}

	const payload: AdminUserUpdatePayload = {};
	if (username !== editingUserOriginal.username) {
		payload.username = username;
	}
	if (email !== editingUserOriginal.email) {
		payload.email = email;
	}
	if (avatarUrl !== editingUserOriginal.avatarUrl) {
		payload.avatarUrl = avatarUrl;
	}
	if (password) {
		payload.password = password;
	}

	if (Object.keys(payload).length === 0) {
		emitErrorToast("用户管理", "没有需要保存的更改。");
		return;
	}

	savingUserId = userId;
	status = "正在保存用户资料...";
	try {
		const result = await updateAdminUser(userId, payload);
		cancelEditUser(true);
		await refreshData();
		status = "";
		emitSuccessToast("用户管理", result.message || "用户资料已更新。", false);
	} catch (error) {
		status = "";
		emitErrorToast(
			"用户管理",
			error instanceof Error ? error.message : "用户资料更新失败。",
		);
	} finally {
		savingUserId = "";
	}
}

async function runUserAction(
	userId: string,
	action: "verify" | "resend" | "delete",
) {
	if (userActionBusyId || savingUserId) return;
	if (
		action === "delete" &&
		!window.confirm("确定要删除这个用户吗？此操作不可撤销。")
	) {
		return;
	}
	userActionBusyId = userId;
	userActionType = action;
	if (isEditingUser(userId)) {
		cancelEditUser(true);
	}
	status =
		action === "verify"
			? "正在手动通过验证..."
			: action === "resend"
				? "正在重发验证邮件..."
				: "正在删除用户...";
	try {
		const result =
			action === "verify"
				? await verifyAdminUser(userId)
				: action === "resend"
					? await resendAdminUserVerification(userId)
					: await deleteAdminUser(userId);
		await refreshData();
		status = "";
		emitSuccessToast(
			"用户管理",
			result.message ||
				(action === "verify"
					? "用户已手动验证。"
					: action === "resend"
						? "验证邮件已重新发送。"
						: "用户已删除。"),
			false,
		);
	} catch (error) {
		status = "";
		emitErrorToast(
			"用户管理",
			error instanceof Error ? error.message : "用户操作失败。",
		);
	} finally {
		userActionBusyId = "";
		userActionType = "";
	}
}

function resolveGcItems() {
	return storageGcResult?.orphans || [];
}

function resolveGcCount() {
	return storageGcResult?.orphaned_files ?? resolveGcItems().length;
}

async function scanStorageGcAction() {
	if (storageScanning) return;
	storageScanning = true;
	status = "正在分析孤儿文件...";
	try {
		storageGcResult = await scanAdminStorageGc();
		status = "";
		if (resolveGcCount() > 0) {
			emitSuccessToast(
				"存储清理",
				`分析完成，发现 ${resolveGcCount()} 个孤儿文件。`,
				false,
			);
		} else {
			emitSuccessToast("存储清理", "分析完成，未发现可清理的孤儿文件。", false);
		}
	} catch (error) {
		storageGcResult = null;
		status = "";
		emitErrorToast(
			"存储清理",
			error instanceof Error ? error.message : "孤儿文件分析失败。",
		);
	} finally {
		storageScanning = false;
	}
}

async function cleanupStorageGcAction() {
	if (storageCleaning || !storageGcResult) return;
	const count = resolveGcCount();
	const orphans = resolveGcItems();
	if (!count || orphans.length === 0) return;
	if (
		!window.confirm(`确定要清理这 ${count} 个孤儿文件吗？删除任务会异步执行。`)
	) {
		return;
	}
	storageCleaning = true;
	status = "正在提交孤儿文件删除任务...";
	try {
		const result = await cleanupAdminStorageGc(orphans);
		status = "";
		emitSuccessToast(
			"存储清理",
			result.message || `已提交 ${count} 个孤儿文件的删除任务。`,
			false,
		);
	} catch (error) {
		status = "";
		emitErrorToast(
			"存储清理",
			error instanceof Error ? error.message : "孤儿文件清理失败。",
		);
	} finally {
		storageCleaning = false;
	}
}

onMount(async () => {
	const unsubscribe = forumEnv.baseUrl.subscribe((value) => {
		currentBaseUrl = value;
	});
	hasToken = Boolean(forumAuth.getToken());
	try {
		await loadSession();
		hasToken = Boolean(forumAuth.getToken());
		await refreshData(true);
	} catch (error) {
		status = "";
		emitErrorToast(
			"管理台",
			error instanceof Error ? error.message : "会话加载失败。",
		);
		loading = false;
	}
	return () => unsubscribe();
});
</script>

<div class="space-y-6">
	<div class="card-base p-6 md:p-8 space-y-5">
		<div class="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<div class="mb-2 flex items-center gap-2">
					<Icon icon="material-symbols:shield-outline-rounded" class="text-3xl text-[var(--primary)]" />
					<h1 class="text-2xl font-bold text-white">论坛管理控制台</h1>
				</div>
				<p class="text-sm text-white/45">集中查看论坛统计、站点设置、用户与分类基础数据。</p>
			</div>
			<div class="flex flex-wrap gap-3">
				<a href="/forum/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/60">返回论坛首页</a>
				<a href="/forum/me/" class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70">返回个人中心</a>
				<button class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/75 disabled:opacity-60" disabled={refreshing || loading} on:click={() => refreshData()}>{refreshing ? "刷新中..." : "刷新数据"}</button>
			</div>
		</div>

		{#if status}
			<div class="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">{status}</div>
		{/if}

		{#if loading}
			<div class="transition-opacity duration-200">
				<div class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4 animate-pulse">
					<div class="grid gap-4 md:grid-cols-4">
						<div class="rounded-xl border border-white/10 bg-white/5 p-5">
							<div class="mb-1 h-4 w-16 rounded bg-white/8"></div>
							<div class="mt-2 h-8 w-20 rounded bg-white/10"></div>
						</div>
						<div class="rounded-xl border border-white/10 bg-white/5 p-5">
							<div class="mb-1 h-4 w-16 rounded bg-white/8"></div>
							<div class="mt-2 h-8 w-20 rounded bg-white/10"></div>
						</div>
						<div class="rounded-xl border border-white/10 bg-white/5 p-5">
							<div class="mb-1 h-4 w-16 rounded bg-white/8"></div>
							<div class="mt-2 h-8 w-20 rounded bg-white/10"></div>
						</div>
						<div class="rounded-xl border border-white/10 bg-white/5 p-5">
							<div class="mb-1 h-4 w-20 rounded bg-white/8"></div>
							<div class="mt-2 h-8 w-16 rounded bg-white/10"></div>
						</div>
					</div>
					<div class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
						<div class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
							<div class="h-5 w-20 rounded bg-white/10"></div>
							<div class="space-y-3">
								<div class="h-10 w-full rounded-xl bg-white/5"></div>
								<div class="h-10 w-full rounded-xl bg-white/5"></div>
							</div>
						</div>
						<div class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
							<div class="h-5 w-24 rounded bg-white/10"></div>
							<div class="space-y-3">
								<div class="h-4 w-full rounded bg-white/8"></div>
								<div class="h-4 w-3/4 rounded bg-white/8"></div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{:else if !isAdmin}
			<div 
				class="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/60 space-y-3 transition-opacity duration-200"
				class:opacity-0={!contentVisible}
				class:opacity-100={contentVisible}
			>
				<h2 class="text-lg font-bold text-white">无法进入管理控制台</h2>
				<p>{status || "当前账号不是管理员，无法进入论坛管理控制台。"}</p>
				<div class="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/45 space-y-1">
					<div>当前站点：{typeof window !== "undefined" ? window.location.origin : ""}</div>
					<div>论坛接口：{currentBaseUrl || "未读取到"}</div>
					<div>本地 token：{hasToken ? "已检测到" : "未检测到"}</div>
					<div>当前会话角色：{currentUser?.role || "未读取到"}</div>
				</div>
			</div>
{:else}
			<div 
				class="space-y-6 transition-opacity duration-200"
				class:opacity-0={!contentVisible}
				class:opacity-100={contentVisible}
			>
			<div class="grid gap-4 md:grid-cols-4">
				<div class="rounded-xl border border-white/10 bg-white/5 p-5">
					<div class="text-sm text-white/40 mb-1">用户总数</div>
					<div class="text-3xl font-bold text-white">{stats?.users ?? 0}</div>
				</div>
				<div class="rounded-xl border border-white/10 bg-white/5 p-5">
					<div class="text-sm text-white/40 mb-1">帖子总数</div>
					<div class="text-3xl font-bold text-white">{stats?.posts ?? 0}</div>
				</div>
				<div class="rounded-xl border border-white/10 bg-white/5 p-5">
					<div class="text-sm text-white/40 mb-1">评论总数</div>
					<div class="text-3xl font-bold text-white">{stats?.comments ?? 0}</div>
				</div>
				<div class="rounded-xl border border-white/10 bg-white/5 p-5">
					<div class="text-sm text-white/40 mb-1">文章订阅人数</div>
					<div class="text-3xl font-bold text-white">{articleNotificationsCount}</div>
				</div>
			</div>

			<div class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
				<section class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
					<h2 class="text-lg font-bold text-white">站点设置</h2>
					<label class="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" bind:checked={settings.turnstileEnabled} />启用 Turnstile</label>
					<label class="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" bind:checked={settings.notifyOnUserDelete} />删除账号时通知用户</label>
					<label class="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" bind:checked={settings.notifyOnPostDelete} />删除帖子时通知用户</label>
					<label class="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" bind:checked={settings.notifyOnUsernameChange} />修改用户名时通知用户</label>
					<label class="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" bind:checked={settings.notifyOnAvatarChange} />修改头像时通知用户</label>
					<label class="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" bind:checked={settings.notifyOnManualVerify} />手动验证时通知用户</label>
					<div class="space-y-2">
						<label class="text-sm text-white/65" for="forum-admin-session-days">登录态有效天数</label>
						<input id="forum-admin-session-days" bind:value={settings.sessionTtlDays} type="number" min="1" max="365" class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" />
					</div>
					<button class="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-black/80" on:click={saveSettingsAction}>保存设置</button>
				</section>

				<section class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
					<h2 class="text-lg font-bold text-white">邮件测试</h2>
					<div class="space-y-2">
						<label class="text-sm text-white/65" for="forum-admin-email-test">收件邮箱</label>
						<input id="forum-admin-email-test" bind:value={emailTestTo} type="email" class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="name@example.com" />
					</div>
					<div class="space-y-3">
						<div class="flex items-center justify-between gap-3">
							<label class="text-sm text-white/65">测试模板</label>
							<label class="flex items-center gap-2 text-sm text-white/65">
								<input type="checkbox" checked={isAllEmailTemplatesSelected()} on:change={(event) => toggleAllEmailTemplates((event.currentTarget as HTMLInputElement).checked)} />
								全选
							</label>
						</div>
						<div class="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
							{#each emailTemplateOptions as option}
								<label class="flex items-center gap-2 text-sm text-white/70">
									<input type="checkbox" bind:group={emailTestTemplates} value={option.value} />
									{option.label}
								</label>
							{/each}
						</div>
						<p class="text-xs text-white/40">已选择 {emailTestTemplates.length} / {emailTemplateOptions.length} 个模板；全选时将走后端批量发送。</p>
					</div>
					<button class="rounded-xl border border-white/10 px-5 py-3 font-bold text-white/80 disabled:opacity-60" disabled={emailTesting || !emailTestTo.trim() || emailTestTemplates.length === 0} on:click={sendEmailTestAction}>{emailTesting ? "测试中..." : isAllEmailTemplatesSelected() ? "测试全部模板" : `发送 ${emailTestTemplates.length} 个测试模板`}</button>
					{#if emailResults.length > 0}
						<div class="space-y-2">
							{#each emailResults as result}
								<div class="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
									<div class="font-bold text-white">{result.label || result.template}</div>
									<div class={result.success ? "text-emerald-300" : "text-red-200"}>{result.success ? "发送成功" : result.error || "发送失败"}</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>
			</div>

			<div class="space-y-6">
				<section class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 class="text-lg font-bold text-white">S3 无关联文件 GC</h2>
							<p class="text-sm text-white/45">先分析孤儿文件，再二次确认后异步提交删除任务。</p>
						</div>
						<div class="flex flex-wrap gap-2">
							<button class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/80 disabled:opacity-60" disabled={storageScanning || storageCleaning} on:click={scanStorageGcAction}>{storageScanning ? "分析中..." : "分析孤儿文件"}</button>
							<button class="rounded-xl border border-red-200/20 px-4 py-3 text-sm font-bold text-red-200 disabled:opacity-60" disabled={storageCleaning || storageScanning || !storageGcResult || resolveGcCount() === 0} on:click={cleanupStorageGcAction}>{storageCleaning ? "提交中..." : "确认执行清理"}</button>
						</div>
					</div>
					{#if storageGcResult}
						<div class="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70 space-y-3">
							<div class="flex flex-wrap gap-x-6 gap-y-2">
								<div>总文件数：<span class="font-bold text-white">{storageGcResult.total_files ?? 0}</span></div>
								<div>已引用：<span class="font-bold text-white">{storageGcResult.used_files ?? 0}</span></div>
								<div>孤儿文件：<span class="font-bold text-white">{resolveGcCount()}</span></div>
							</div>
							{#if resolveGcItems().length > 0}
								<div class="space-y-2">
									<div class="text-xs uppercase tracking-wide text-white/35">孤儿对象样本</div>
									{#each resolveGcItems().slice(0, 8) as item}
										<div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
											<div class="break-all font-mono text-white/75">{item}</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</section>

				<section class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
					<h2 class="text-lg font-bold text-white">分类管理</h2>
					<div class="flex flex-col gap-3 sm:flex-row">
						<input bind:value={newCategoryName} class="flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" placeholder="新增分类名称" />
						<button class="rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-bold text-black/80" on:click={createCategoryAction}>添加</button>
					</div>
					<div class="space-y-2">
						{#if categories.length === 0}
							<p class="text-sm text-white/45">暂无分类数据。</p>
						{:else}
							{#each categories as category}
								<div class="rounded-xl border border-white/10 bg-black/20 p-3">
									{#if editingCategoryId === category.id}
										<div class="flex flex-col gap-3 sm:flex-row">
											<input bind:value={editingCategoryName} class="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" />
											<button class="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/80" on:click={() => saveCategoryAction(category.id)}>保存</button>
										</div>
									{:else}
										<div class="flex items-center justify-between gap-3">
											<div>
												<div class="font-bold text-white">{category.name}</div>
												{#if category.description}<div class="text-sm text-white/40">{category.description}</div>{/if}
											</div>
											<div class="flex flex-wrap gap-2">
												<button class="rounded-xl border border-white/10 px-3 py-2 text-sm font-bold text-white/75" on:click={() => { editingCategoryId = category.id; editingCategoryName = category.name; }}>编辑</button>
												<button class="rounded-xl border border-red-200/20 px-3 py-2 text-sm font-bold text-red-200" on:click={() => deleteCategoryAction(category.id)}>删除</button>
											</div>
										</div>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				</section>

				<section class="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
					<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<h2 class="text-lg font-bold text-white">用户列表</h2>
						<form class="flex w-full flex-col gap-2 md:w-auto md:min-w-[26rem] md:flex-row" on:submit|preventDefault={submitUserSearch}>
							<input
								bind:value={userSearchQuery}
								type="text"
								placeholder="搜索用户名或邮箱"
								class="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white outline-none focus:border-[var(--primary)]"
							/>
							<div class="flex gap-2">
								<button class="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-white/75 disabled:opacity-60" type="submit" disabled={loading || refreshing || userSearchSubmitting}>{userSearchSubmitting ? "搜索中..." : "搜索"}</button>
								<button class="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-white/55 disabled:opacity-60" type="button" disabled={loading || refreshing || userSearchSubmitting || !userSearchQuery} on:click={resetUserSearch}>清空</button>
							</div>
						</form>
					</div>

					<div class="text-sm text-white/40">
						{#if userSearchQuery.trim()}
							当前搜索：<span class="text-white/70">{userSearchQuery.trim()}</span> · 共 {users.length} 条结果
						{:else}
							当前显示全部用户 · 共 {users.length} 条
						{/if}
					</div>

					<div class="space-y-3 md:hidden">
						{#each users as forumUser}
							<div class="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
								<div class="flex items-center gap-3">
									{#if forumUser.avatarUrl}
										<img src={forumUser.avatarUrl} alt={forumUser.username} class="h-10 w-10 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
									{:else}
										<span class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-white/45">
											<Icon icon="material-symbols:person-outline-rounded" />
										</span>
									{/if}
									<div class="min-w-0 flex-1 overflow-hidden">
										<div class="truncate font-bold text-white" title={forumUser.displayName || forumUser.username}>{truncateDisplayName(forumUser.displayName || forumUser.username)}</div>
									</div>
								</div>

								{#if isEditingUser(forumUser.id)}
									<div class="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4 text-sm text-white/70">
										<div>
											<div class="text-base font-bold text-white">编辑用户</div>
											<div class="mt-1 text-xs text-white/40">修改用户名 / 邮箱 / 头像 / 密码</div>
										</div>
										<div class="space-y-1">
											<div class="text-xs text-white/40">用户名</div>
											<input bind:value={editingUserForm.username} type="text" maxlength="20" class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" />
										</div>
										<div class="space-y-1">
											<div class="text-xs text-white/40">邮箱</div>
											<input bind:value={editingUserForm.email} type="email" class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" />
										</div>
										<div class="space-y-1">
											<div class="text-xs text-white/40">头像 URL</div>
											<input bind:value={editingUserForm.avatarUrl} type="text" class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" />
										</div>
										<div class="space-y-1">
											<div class="text-xs text-white/40">新密码（留空不变）</div>
											<input bind:value={editingUserForm.password} type="password" minlength="8" maxlength="16" class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[var(--primary)]" />
										</div>
										<div><span class="text-white/40">角色：</span>{forumUser.role || "user"}</div>
										<div><span class="text-white/40">状态：</span>{forumUser.verified ? "已验证" : "未验证"}{forumUser.totpEnabled ? " · 2FA" : ""}</div>
									</div>

									<div class="flex flex-wrap gap-2">
										<button class="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-bold text-black/80 disabled:opacity-60" disabled={Boolean(savingUserId)} on:click={() => saveUserAction(forumUser.id)}>{savingUserId === forumUser.id ? "保存中..." : "保存编辑"}</button>
										<button class="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/75 disabled:opacity-60" disabled={Boolean(savingUserId)} on:click={() => cancelEditUser()}>取消</button>
									</div>
								{:else}
									<div class="grid gap-2 text-sm text-white/70">
										<div><span class="text-white/40">邮箱：</span><span class="break-all">{forumUser.email || "-"}</span></div>
										<div><span class="text-white/40">角色：</span>{forumUser.role || "user"}</div>
										<div><span class="text-white/40">状态：</span>{forumUser.verified ? "已验证" : "未验证"}{forumUser.totpEnabled ? " · 2FA" : ""}</div>
										<div><span class="text-white/40">最后上线：</span>{formatLastSeen(forumUser.lastSeenAt)}</div>
									</div>

									<div class="flex flex-wrap gap-2">
										<button class="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/75 disabled:opacity-60" disabled={hasUserActionConflict(forumUser.id)} on:click={() => startEditUser(forumUser)}>编辑资料</button>
										{#if !forumUser.verified}
											<button class="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/75 disabled:opacity-60" disabled={userActionBusyId === forumUser.id || Boolean(editingUserId)} on:click={() => runUserAction(forumUser.id, "resend")}>{userActionBusyId === forumUser.id && userActionType === "resend" ? "发送中..." : "重发验证"}</button>
										{/if}
										<button class="rounded-xl border border-emerald-300/20 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-60" disabled={userActionBusyId === forumUser.id || forumUser.verified || Boolean(editingUserId)} on:click={() => runUserAction(forumUser.id, "verify")}>{userActionBusyId === forumUser.id && userActionType === "verify" ? "处理中..." : "手动通过"}</button>
										<button class="rounded-xl border border-red-200/20 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-60" disabled={userActionBusyId === forumUser.id || Boolean(editingUserId)} on:click={() => runUserAction(forumUser.id, "delete")}>{userActionBusyId === forumUser.id && userActionType === "delete" ? "删除中..." : "删除用户"}</button>
									</div>
								{/if}
							</div>
						{/each}
					</div>

					<div class="hidden overflow-x-auto md:block">
						<table class="min-w-full table-fixed text-left text-sm text-white/75">
							<thead class="text-white/40">
								<tr>
									<th class="px-3 py-2">用户名</th>
									<th class="px-3 py-2">邮箱</th>
									<th class="px-3 py-2">角色</th>
									<th class="px-3 py-2 whitespace-nowrap">状态</th>
									<th class="px-3 py-2 whitespace-nowrap">最后上线</th>
									<th class="px-3 py-2 whitespace-nowrap">操作</th>
								</tr>
							</thead>
							<tbody>
								{#each users as forumUser}
									{#if isEditingUser(forumUser.id)}
										<tr class="border-t border-white/10">
											<td colspan="6" class="px-3 py-4">
												<div class="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70 space-y-4">
													<div>
														<div class="text-base font-bold text-white">编辑用户</div>
														<div class="mt-1 text-xs text-white/40">修改用户名 / 邮箱 / 头像 / 密码</div>
													</div>
													<div class="grid gap-4 lg:grid-cols-2">
														<div class="space-y-1">
															<div class="text-xs text-white/40">用户名</div>
															<input bind:value={editingUserForm.username} type="text" maxlength="20" class="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:border-[var(--primary)]" />
														</div>
														<div class="space-y-1">
															<div class="text-xs text-white/40">邮箱</div>
															<input bind:value={editingUserForm.email} type="email" class="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:border-[var(--primary)]" />
														</div>
														<div class="space-y-1 lg:col-span-2">
															<div class="text-xs text-white/40">头像 URL</div>
															<input bind:value={editingUserForm.avatarUrl} type="text" class="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:border-[var(--primary)]" />
														</div>
														<div class="space-y-1">
															<div class="text-xs text-white/40">新密码（留空不变）</div>
															<input bind:value={editingUserForm.password} type="password" minlength="8" maxlength="16" class="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:border-[var(--primary)]" />
														</div>
														<div class="space-y-1">
															<div class="text-xs text-white/40">当前信息</div>
															<div class="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/70">角色：{forumUser.role || "user"} · 状态：{forumUser.verified ? "已验证" : "未验证"}{forumUser.totpEnabled ? " · 2FA" : ""}</div>
														</div>
													</div>
													<div class="flex flex-wrap gap-2">
														<button class="rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-bold text-black/80 disabled:opacity-60" disabled={Boolean(savingUserId)} on:click={() => saveUserAction(forumUser.id)}>{savingUserId === forumUser.id ? "保存中..." : "保存编辑"}</button>
														<button class="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/75 disabled:opacity-60" disabled={Boolean(savingUserId)} on:click={() => cancelEditUser()}>取消</button>
													</div>
												</div>
											</td>
										</tr>
									{:else}
										<tr class="border-t border-white/10 align-top">
											<td class="px-3 py-3">
												<div class="flex items-center gap-3">
													{#if forumUser.avatarUrl}
														<img src={forumUser.avatarUrl} alt={forumUser.username} class="h-8 w-8 rounded-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
													{:else}
														<span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/45">
															<Icon icon="material-symbols:person-outline-rounded" />
														</span>
													{/if}
													<div class="min-w-0 flex-1 overflow-hidden">
														<div class="truncate font-bold text-white" title={forumUser.displayName || forumUser.username}>{truncateDisplayName(forumUser.displayName || forumUser.username)}</div>
													</div>
												</div>
											</td>
											<td class="px-3 py-3">
												<div class="break-all">{forumUser.email || "-"}</div>
											</td>
											<td class="px-3 py-3">{forumUser.role || "user"}</td>
											<td class="px-3 py-3 whitespace-nowrap">{forumUser.verified ? "已验证" : "未验证"}{forumUser.totpEnabled ? " · 2FA" : ""}</td>
											<td class="px-3 py-3 whitespace-nowrap text-white/50" title={forumUser.lastSeenAt || ""}>{formatLastSeen(forumUser.lastSeenAt)}</td>
											<td class="px-3 py-3 whitespace-nowrap">
												<div class="flex flex-wrap gap-2">
													<button class="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/75 disabled:opacity-60" disabled={hasUserActionConflict(forumUser.id)} on:click={() => startEditUser(forumUser)}>编辑资料</button>
													{#if !forumUser.verified}
														<button class="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/75 disabled:opacity-60" disabled={userActionBusyId === forumUser.id || Boolean(editingUserId)} on:click={() => runUserAction(forumUser.id, "resend")}>{userActionBusyId === forumUser.id && userActionType === "resend" ? "发送中..." : "重发验证"}</button>
													{/if}
													<button class="rounded-xl border border-emerald-300/20 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-60" disabled={userActionBusyId === forumUser.id || forumUser.verified || Boolean(editingUserId)} on:click={() => runUserAction(forumUser.id, "verify")}>{userActionBusyId === forumUser.id && userActionType === "verify" ? "处理中..." : "手动通过"}</button>
													<button class="rounded-xl border border-red-200/20 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-60" disabled={userActionBusyId === forumUser.id || Boolean(editingUserId)} on:click={() => runUserAction(forumUser.id, "delete")}>{userActionBusyId === forumUser.id && userActionType === "delete" ? "删除中..." : "删除用户"}</button>
												</div>
											</td>
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			</div>
			</div>

		{/if}
	</div>
</div>

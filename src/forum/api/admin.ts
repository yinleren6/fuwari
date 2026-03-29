import type {
	AdminEmailTestOptions,
	AdminEmailTestResult,
	AdminStats,
	AdminStorageGcCleanupResult,
	AdminStorageGcScanResult,
	AdminUserActionResult,
	AdminUserUpdatePayload,
	ForumAdminSettings,
} from "@/forum/types/api";
import type { ForumCategory } from "@/forum/types/post";
import type { ForumUser } from "@/forum/types/user";
import { forumRequest } from "./client";

interface RawAdminSettings {
	turnstile_enabled?: boolean;
	notify_on_user_delete?: boolean;
	notify_on_username_change?: boolean;
	notify_on_avatar_change?: boolean;
	notify_on_manual_verify?: boolean;
	session_ttl_days?: number;
}

interface RawAdminUser {
	id: string | number;
	email?: string;
	username?: string;
	display_name?: string;
	avatar_url?: string | null;
	role?: string;
	created_at?: string;
	verified?: number | boolean;
	totp_enabled?: number | boolean;
}

interface RawCategory {
	id: string | number;
	name?: string;
	slug?: string;
	description?: string;
}

function normalizeAdminSettings(settings: RawAdminSettings): ForumAdminSettings {
	return {
		turnstileEnabled: Boolean(settings.turnstile_enabled),
		notifyOnUserDelete: Boolean(settings.notify_on_user_delete),
		notifyOnUsernameChange: Boolean(settings.notify_on_username_change),
		notifyOnAvatarChange: Boolean(settings.notify_on_avatar_change),
		notifyOnManualVerify: Boolean(settings.notify_on_manual_verify),
		sessionTtlDays: settings.session_ttl_days || 7,
	};
}

function normalizeAdminUser(user: RawAdminUser): ForumUser {
	return {
		id: String(user.id),
		email: user.email,
		username: user.username || user.email || "用户",
		displayName: user.display_name || user.username,
		avatarUrl: user.avatar_url || undefined,
		role: user.role,
		createdAt: user.created_at,
		verified: user.verified !== undefined ? Boolean(user.verified) : undefined,
		totpEnabled: user.totp_enabled !== undefined ? Boolean(user.totp_enabled) : undefined,
	};
}

function normalizeCategory(category: RawCategory): ForumCategory {
	return {
		id: String(category.id),
		name: category.name || "未命名分类",
		slug: category.slug,
		description: category.description,
	};
}

export function getAdminStats() {
	return forumRequest<AdminStats>("/api/admin/stats", {
		requiresAuth: true,
	});
}

export async function getAdminSettings() {
	const result = await forumRequest<RawAdminSettings>("/api/admin/settings", {
		requiresAuth: true,
	});
	return normalizeAdminSettings(result);
}

export function saveAdminSettings(settings: ForumAdminSettings) {
	return forumRequest<{ success?: boolean }>("/api/admin/settings", {
		method: "POST",
		requiresAuth: true,
		json: {
			turnstile_enabled: settings.turnstileEnabled,
			notify_on_user_delete: settings.notifyOnUserDelete,
			notify_on_username_change: settings.notifyOnUsernameChange,
			notify_on_avatar_change: settings.notifyOnAvatarChange,
			notify_on_manual_verify: settings.notifyOnManualVerify,
			session_ttl_days: settings.sessionTtlDays,
		},
	});
}

export async function getAdminUsers() {
	const result = await forumRequest<RawAdminUser[]>("/api/admin/users", {
		requiresAuth: true,
	});
	return result.map(normalizeAdminUser);
}

export async function getAdminCategories() {
	const result = await forumRequest<RawCategory[] | { items?: RawCategory[]; categories?: RawCategory[] }>("/api/categories");
	const categories = Array.isArray(result) ? result : result.items || result.categories || [];
	return categories.map(normalizeCategory);
}

export function createAdminCategory(name: string) {
	return forumRequest<{ success?: boolean }>("/api/admin/categories", {
		method: "POST",
		requiresAuth: true,
		json: { name },
	});
}

export function updateAdminCategory(id: string, name: string) {
	return forumRequest<{ success?: boolean }>(`/api/admin/categories/${id}`, {
		method: "PUT",
		requiresAuth: true,
		json: { name },
	});
}

export function deleteAdminCategory(id: string) {
	return forumRequest<{ success?: boolean }>(`/api/admin/categories/${id}`, {
		method: "DELETE",
		requiresAuth: true,
	});
}

function normalizeEmailTestResults(result: { results?: AdminEmailTestResult[] } | AdminEmailTestResult[] | AdminEmailTestResult | null | undefined) {
	if (Array.isArray(result)) {
		return result;
	}
	if (result && typeof result === "object" && "results" in result && Array.isArray(result.results)) {
		return result.results;
	}
	if (result && typeof result === "object" && "template" in result) {
		return [result];
	}
	return [];
}

export async function sendAdminTestEmail(options: AdminEmailTestOptions) {
	const result = await forumRequest<{ results?: AdminEmailTestResult[] } | AdminEmailTestResult[] | AdminEmailTestResult>("/api/admin/email/test", {
		method: "POST",
		requiresAuth: true,
		json: {
			to: options.to,
			template: options.template,
			payload: options.payload,
		},
	});
	return normalizeEmailTestResults(result);
}

export function resendAdminUserVerification(userId: string) {
	return forumRequest<AdminUserActionResult>(`/api/admin/users/${userId}/resend-verification`, {
		method: "POST",
		requiresAuth: true,
		json: {},
	});
}

export function verifyAdminUser(userId: string) {
	return forumRequest<AdminUserActionResult>(`/api/admin/users/${userId}/verify`, {
		method: "POST",
		requiresAuth: true,
		json: {},
	});
}

export function deleteAdminUser(userId: string) {
	return forumRequest<AdminUserActionResult>(`/api/admin/users/${userId}`, {
		method: "DELETE",
		requiresAuth: true,
	});
}

export function updateAdminUser(userId: string, payload: AdminUserUpdatePayload) {
	return forumRequest<AdminUserActionResult>(`/api/admin/users/${userId}/update`, {
		method: "POST",
		requiresAuth: true,
		json: {
			username: payload.username,
			email: payload.email,
			avatar_url: payload.avatarUrl,
			password: payload.password,
		},
	});
}

export function scanAdminStorageGc() {
	return forumRequest<AdminStorageGcScanResult>("/api/admin/cleanup/analyze", {
		requiresAuth: true,
	});
}

export function cleanupAdminStorageGc(orphans?: string[]) {
	return forumRequest<AdminStorageGcCleanupResult>("/api/admin/cleanup/execute", {
		method: "POST",
		requiresAuth: true,
		json: {
			orphans,
		},
	});
}

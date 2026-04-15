/**
 * Diff 相关的共享工具函数
 */

const BASE_URL = import.meta.env.BASE_URL || "/";

/**
 * 规范化 GUID 或链接为路径格式
 */
export function normalizeGuid(guid: string, link: string): string {
	const value = (guid || link || "").trim();
	if (!value) return "";
	try {
		const url = new URL(value, window.location.origin);
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return value;
	}
}

/**
 * 将绝对 URL 转换为相对路径
 */
export function getRelativePath(absoluteUrl: string): string {
	try {
		const url = new URL(absoluteUrl, window.location.origin);
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return absoluteUrl;
	}
}

/**
 * 规范化路径名（移除尾部斜杠）
 */
export function normalizePathname(pathname: string): string {
	const p = String(pathname || "");
	if (!p) return "/";
	const noQueryHash = p.split("#")[0].split("?")[0];
	if (noQueryHash.length > 1) return noQueryHash.replace(/\/+$/, "");
	return "/";
}

/**
 * 从路径中移除 base path
 */
export function stripBasePath(pathname: string): string {
	const base = normalizePathname(BASE_URL);
	const p = normalizePathname(pathname);
	if (!base || base === "/") return p;
	if (p === base) return "/";
	if (p.startsWith(`${base}/`)) return p.slice(base.length) || "/";
	return p;
}

/**
 * 为路径添加 base path
 */
export function withBasePath(pathname: string): string {
	const basePath = String(BASE_URL).endsWith("/")
		? String(BASE_URL).slice(0, -1)
		: String(BASE_URL);
	const p = String(pathname || "");
	if (!basePath || basePath === "/" || !p.startsWith("/")) return p;
	if (p === basePath || p.startsWith(`${basePath}/`)) return p;
	return `${basePath}${p}`;
}

/**
 * 解码 HTML 实体
 */
export function decodeHtmlEntities(value: string): string {
	const t = document.createElement("textarea");
	t.innerHTML = String(value ?? "");
	return t.value;
}

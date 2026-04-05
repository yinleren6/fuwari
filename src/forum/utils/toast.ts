export type ForumToastType = "success" | "error" | "info" | "warning";

export interface ForumToastDetail {
	type: ForumToastType;
	title: string;
	description: string;
}

export const FORUM_TOAST_EVENT = "forum:toast";

export function emitToast(detail: ForumToastDetail): void {
	window.dispatchEvent(
		new CustomEvent<ForumToastDetail>(FORUM_TOAST_EVENT, { detail }),
	);
}

export function emitSuccessToast(title: string, description: string): void {
	emitToast({ type: "success", title, description });
}

export function emitErrorToast(title: string, description: string): void {
	emitToast({ type: "error", title, description });
}

export function emitInfoToast(title: string, description: string): void {
	emitToast({ type: "info", title, description });
}

export function emitWarningToast(title: string, description: string): void {
	emitToast({ type: "warning", title, description });
}

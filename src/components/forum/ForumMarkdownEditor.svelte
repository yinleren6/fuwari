<script lang="ts">
import { type ForumUploadType, uploadFile } from "@/forum/api/auth";
import { ForumApiError } from "@/forum/types/api";
import {
	POST_IMAGE_MAX_BYTES,
	compressPostImage,
	isPostImageWithinLimit,
} from "@/forum/utils/image-compression";
import type Editor from "@toast-ui/editor";
import { createEventDispatcher, onDestroy, onMount } from "svelte";

type EditorMode = "post" | "comment" | "reply";

const toolbarMap: Record<EditorMode, string[][]> = {
	post: [
		["heading", "bold", "italic", "strike"],
		["hr", "quote"],
		["ul", "ol", "task"],
		["table", "link", "image"],
		["code", "codeblock"],
	],
	comment: [
		["bold", "italic", "strike"],
		["quote", "ul", "ol"],
		["link", "image", "code", "codeblock"],
	],
	reply: [
		["bold", "italic"],
		["quote", "link", "image"],
		["code", "codeblock"],
	],
};

const MAX_UPLOAD_SIZE_LABEL = `${Math.round(POST_IMAGE_MAX_BYTES / 1024)}KB`;

export let value = "";
export let placeholder = "支持 Markdown";
export let disabled = false;
export let submitting = false;
export let mode: EditorMode = "comment";
export let uploadType: Exclude<ForumUploadType, "avatar"> | undefined =
	undefined;
export let uploadPostId = "";
export let submitHint = "Ctrl/Cmd + Enter 提交";
export let minHeight = 220;
export let shellClass = "";
export let autoFocus = false;

const dispatch = createEventDispatcher<{
	submit: void;
	escape: void;
	change: { value: string };
}>();

let containerEl: HTMLDivElement;
let editor: Editor | null = null;
let internalValue = value;
let keydownCleanup: (() => void) | null = null;
let uploadStatus = "";
let uploading = false;

function syncValue(nextValue: string) {
	internalValue = nextValue;
	if (value !== nextValue) {
		value = nextValue;
		dispatch("change", { value: nextValue });
	}
}

async function updatePreviewClasses() {
	const previewEl = containerEl?.querySelector(".toastui-editor-contents");
	if (!previewEl) return;
	previewEl.classList.add(
		"custom-md",
		"prose",
		"prose-invert",
		"!max-w-none",
		"break-words",
		"text-white/75",
	);
	previewEl.classList.remove("forum-comment-md");
	
	// 导入并应用代码高亮
	const { highlightAllCodeBlocks } = await import("@/utils/code-highlight");
	highlightAllCodeBlocks();
}

function setDisabledState(nextDisabled: boolean) {
	const root = containerEl?.querySelector(".toastui-editor-defaultUI");
	root?.classList.toggle("is-disabled", nextDisabled);
	if (editor && typeof editor.setDisabled === "function") {
		editor.setDisabled(nextDisabled);
	}
}

function normalizeUploadError(error: unknown) {
	if (error instanceof ForumApiError && error.status === 401) {
		return "请先登录论坛后再上传图片。";
	}
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return "图片上传失败，请稍后重试。";
}

async function handleImageUpload(
	blob: Blob | File,
	callback: (url: string, text?: string) => void,
) {
	if (!uploadType) {
		uploadStatus = "当前编辑器未启用图片上传。";
		return;
	}

	if (!(blob instanceof File)) {
		uploadStatus = "仅支持上传图片文件。";
		return;
	}

	if (!blob.type.startsWith("image/")) {
		uploadStatus = "仅支持上传图片文件。";
		return;
	}

	uploading = true;
	uploadStatus = "正在压缩图片...";

	let uploadFileTarget = blob;

	try {
		try {
			uploadFileTarget = await compressPostImage(blob);
		} catch (error) {
			if (!isPostImageWithinLimit(blob)) {
				throw new Error(
					`图片压缩失败，且原图仍超过 ${MAX_UPLOAD_SIZE_LABEL} 限制。`,
				);
			}
			uploadFileTarget = blob;
		}

		if (!isPostImageWithinLimit(uploadFileTarget)) {
			uploadStatus = `压缩后图片仍超过 ${MAX_UPLOAD_SIZE_LABEL}，请更换更小的图片。`;
			return;
		}

		uploadStatus =
			uploadFileTarget === blob ? "正在上传图片..." : "正在上传压缩后的图片...";
		const url = await uploadFile({
			file: uploadFileTarget,
			type: uploadType,
			postId: uploadPostId || undefined,
		});
		if (!url) {
			throw new Error("上传成功，但未获取到图片地址。");
		}
		callback(url, uploadFileTarget.name || blob.name || "image");
		uploadStatus = "图片已上传并插入。";
		syncValue(editor?.getMarkdown() || "");
	} catch (error) {
		uploadStatus = normalizeUploadError(error);
	} finally {
		uploading = false;
	}
}

onMount(() => {
	let disposed = false;

	void (async () => {
		const { default: Editor } = await import("@toast-ui/editor");
		if (disposed) {
			return;
		}

		editor = new Editor({
			el: containerEl,
			height: `${minHeight}px`,
			autofocus: autoFocus,
			initialEditType: "markdown",
			previewStyle: "vertical",
			initialValue: value,
			placeholder,
			theme: "dark",
			usageStatistics: false,
			hideModeSwitch: true,
			toolbarItems: toolbarMap[mode],
			useCommandShortcut: true,
			hooks: {
				addImageBlobHook: async (
					blob: Blob | File,
					callback: (url: string, text?: string) => void,
				) => {
					await handleImageUpload(blob, callback);
					return false;
				},
			},
		});

		editor.on("change", () => {
			syncValue(editor?.getMarkdown() || "");
			void updatePreviewClasses();
		});

		const keydownHandler = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
				event.preventDefault();
				dispatch("submit");
				return;
			}

			if (event.key === "Escape") {
				dispatch("escape");
			}
		};

		containerEl.addEventListener("keydown", keydownHandler);
		keydownCleanup = () =>
			containerEl.removeEventListener("keydown", keydownHandler);

		await updatePreviewClasses();
		setDisabledState(disabled || submitting);
	})();

	return () => {
		disposed = true;
	};
});

onDestroy(() => {
	keydownCleanup?.();
	keydownCleanup = null;
	editor?.destroy();
	editor = null;
});

$: if (editor && value !== internalValue) {
	internalValue = value;
	editor.setMarkdown(value, false);
	void updatePreviewClasses();
}

$: if (editor && placeholder) {
	editor.setPlaceholder(placeholder);
}

$: if (editor) {
	setDisabledState(disabled || submitting);
}
</script>

<div class={`forum-editor-shell ${shellClass}`.trim()}>
	<div bind:this={containerEl} />
</div>

<style>
	:global(.forum-editor-shell .toastui-editor-defaultUI) {
		zoom: 0.8;
		border-radius: 1rem;
		overflow: hidden;
		border: 1px solid rgb(255 255 255 / 0.1);
		background: rgb(255 255 255 / 0.04);
	}

	:global(.forum-editor-shell .toastui-editor-toolbar) {
		background: rgb(255 255 255 / 0.03);
		border-bottom: 1px solid rgb(255 255 255 / 0.08);
	}

	:global(.forum-editor-shell .toastui-editor-toolbar-icons) {
		border-radius: 0.75rem;
		opacity: 0.9;
	}

	:global(.forum-editor-shell .toastui-editor-main) {
		background: rgb(10 12 18 / 0.36);
	}

	:global(.forum-editor-shell .toastui-editor-md-container),
	:global(.forum-editor-shell .toastui-editor-ww-container),
	:global(.forum-editor-shell .toastui-editor-md-preview) {
		background: rgb(7 10 15 / 0.32);
	}

	:global(.forum-editor-shell.reply-editor-shell .toastui-editor-defaultUI) {
		background: rgb(9 12 18 / 0.88);
		border-color: rgb(255 255 255 / 0.12);
		box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.03);
	}

	:global(.forum-editor-shell.reply-editor-shell .toastui-editor-toolbar) {
		background: rgb(255 255 255 / 0.05);
	}

	:global(.forum-editor-shell.reply-editor-shell .toastui-editor-main) {
		background: rgb(8 11 16 / 0.88);
	}

	:global(.forum-editor-shell.reply-editor-shell .toastui-editor-md-container),
	:global(.forum-editor-shell.reply-editor-shell .toastui-editor-ww-container),
	:global(.forum-editor-shell.reply-editor-shell .toastui-editor-md-preview) {
		background: rgb(8 11 16 / 0.92);
	}

	:global(.forum-editor-shell .toastui-editor-md-preview) {
		border-left: 1px solid rgb(255 255 255 / 0.08);
	}

	:global(.forum-editor-shell .toastui-editor-md-tab-container) {
		display: none;
	}

	:global(.forum-editor-shell .toastui-editor-contents) {
		font-family: inherit;
		color: rgb(255 255 255 / 0.78);
	}

	:global(.forum-editor-shell .toastui-editor-md-preview .toastui-editor-contents),
	:global(.forum-editor-shell .toastui-editor-md-container .toastui-editor-contents) {
		padding: 1rem 1.25rem;
	}

	:global(.forum-editor-shell .toastui-editor-main-container) {
		min-height: inherit;
	}

	:global(.forum-editor-shell .toastui-editor-md-preview .toastui-editor-contents h1),
	:global(.forum-editor-shell .toastui-editor-md-preview .toastui-editor-contents h2),
	:global(.forum-editor-shell .toastui-editor-md-preview .toastui-editor-contents h3),
	:global(.forum-editor-shell .toastui-editor-md-preview .toastui-editor-contents h4),
	:global(.forum-editor-shell .toastui-editor-md-preview .toastui-editor-contents h5),
	:global(.forum-editor-shell .toastui-editor-md-preview .toastui-editor-contents h6) {
		color: white;
	}

	:global(.forum-editor-shell .toastui-editor-defaultUI.is-disabled) {
		opacity: 0.65;
	}
</style>

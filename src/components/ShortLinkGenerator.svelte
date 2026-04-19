<script lang="ts">
import { onMount } from "svelte";

// 零宽字符字母表：ZWSP=0, ZWNJ=1
const ZW_CHARS = ["\u200B", "\u200C"];
// 隐形参数名（用零宽字符作为参数名，更加隐形）
const ZW_PARAM_NAME = "\u200B";

type GeneratedLink = {
	targetUrl: string;
	shortLink: string;
	encodedPart: string;
	charCount: number;
};

let targetUrl = "";
let generatedLinks: GeneratedLink[] = [];
let isGenerating = false;
let errorMessage = "";
let baseUrl = "";

onMount(() => {
	// 获取当前站点的基础 URL
	baseUrl = window.location.origin;
});

/**
 * 使用零宽字符编码 URL
 */
function encodeUrl(url: string): string {
	const encoder = new TextEncoder();
	const bytes = encoder.encode(url);

	let zwEncoded = "";
	for (const byte of bytes) {
		// 每个字节转为 8 位二进制
		const binary = byte.toString(2).padStart(8, "0");
		for (const bit of binary) {
			zwEncoded += ZW_CHARS[parseInt(bit)];
		}
	}
	return zwEncoded;
}

/**
 * 解码零宽字符编码的 URL（用于验证）
 */
function decodeUrl(encoded: string): string {
	const zwSequence = encoded.split("").filter((c) => ZW_CHARS.includes(c));

	let binary = "";
	for (const c of zwSequence) {
		binary += ZW_CHARS.indexOf(c).toString();
	}

	const bytes: number[] = [];
	for (let i = 0; i < binary.length; i += 8) {
		const byteStr = binary.slice(i, i + 8);
		if (byteStr.length === 8) {
			bytes.push(parseInt(byteStr, 2));
		}
	}

	return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * 验证 URL 格式
 */
function isValidUrl(url: string): boolean {
	if (!url || url.trim() === "") return false;

	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * 生成短链接
 */
function generateShortLink() {
	errorMessage = "";

	if (!isValidUrl(targetUrl)) {
		errorMessage = "请输入有效的 HTTP/HTTPS URL";
		return;
	}

	isGenerating = true;

	try {
		const encodedPart = encodeUrl(targetUrl);
		// 使用路径格式：/s/<零宽编码>（完全不可见）
		const shortLink = `${baseUrl}/s/${encodedPart}`;

		// 验证编码/解码是否正确
		const decoded = decodeUrl(encodedPart);
		if (decoded !== targetUrl) {
			throw new Error("编码验证失败");
		}

		// 添加到生成列表
		generatedLinks = [
			{
				targetUrl,
				shortLink,
				encodedPart,
				charCount: encodedPart.length,
			},
			...generatedLinks,
		];

		// 清空输入
		targetUrl = "";
	} catch (e) {
		errorMessage = e instanceof Error ? e.message : "生成失败";
	} finally {
		isGenerating = false;
	}
}

/**
 * 复制到剪贴板
 */
async function copyToClipboard(text: string) {
	try {
		await navigator.clipboard.writeText(text);
		alert("已复制到剪贴板！");
	} catch {
		// 备用方案
		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.style.position = "fixed";
		textarea.style.opacity = "0";
		document.body.appendChild(textarea);
		textarea.select();
		document.execCommand("copy");
		document.body.removeChild(textarea);
		alert("已复制到剪贴板！");
	}
}

/**
 * 清除历史记录
 */
function clearHistory() {
	generatedLinks = [];
}

/**
 * 显示零宽字符的可视化表示
 */
function visualizeZwChars(encoded: string): string {
	return encoded
		.replace(/\u200B/g, "○") // ZWSP 用空心圆表示
		.replace(/\u200C/g, "●"); // ZWNJ 用实心圆表示
}

/**
 * 获取可视化链接（用于演示）
 */
function getVisualLink(encoded: string): string {
	return `${baseUrl}/s/?u=${visualizeZwChars(encoded)}`;
}
</script>

<div class="space-y-6">
	<!-- 输入区域 -->
	<div class="rounded-2xl border border-white/10 bg-white/5 p-5">
		<h2 class="mb-2 text-lg font-bold text-90">生成短链接</h2>
		<p class="mb-5 text-sm leading-relaxed text-50">
			输入目标 URL，将生成使用零宽字符编码的隐形短链接。
			生成的链接视觉上完全相同（路径中的零宽字符不可见），但实际跳转不同目标。
		</p>

		{#if errorMessage}
			<div class="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
				{errorMessage}
			</div>
		{/if}

		<div class="space-y-4">
			<div>
				<label class="block mb-2 text-sm font-medium text-90" for="target-url">
					目标 URL
				</label>
				<input
					id="target-url"
					type="url"
					bind:value={targetUrl}
					placeholder="https://example.com"
					class="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-90 placeholder:text-white/30 focus:border-[var(--primary)] focus:outline-none"
				/>
			</div>

			<button
				type="button"
				on:click={generateShortLink}
				disabled={isGenerating || !targetUrl}
				class="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--primary)]/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
			>
				{isGenerating ? "生成中..." : "生成短链接"}
			</button>
		</div>
	</div>

	<!-- 生成历史 -->
	{#if generatedLinks.length > 0}
		<div class="rounded-2xl border border-white/10 bg-white/5 p-5">
			<div class="flex items-center justify-between mb-5">
				<h2 class="text-lg font-bold text-90">生成的链接</h2>
				<button
					type="button"
					on:click={clearHistory}
					class="rounded-xl border border-white/10 px-4 py-2 text-sm text-50 transition-all hover:border-[var(--primary)] hover:text-90"
				>
					清除历史
				</button>
			</div>

			<div class="space-y-4">
				{#each generatedLinks as link}
					<div class="rounded-xl border border-white/10 bg-black/20 p-4">
						<div class="space-y-3">
							<!-- 目标 URL -->
							<div>
								<p class="mb-1 text-xs text-50">目标 URL</p>
								<p class="text-sm text-90 break-all">{link.targetUrl}</p>
							</div>

							<!-- 生成的短链接 -->
							<div>
								<p class="mb-1 text-xs text-50">短链接（点击复制）</p>
								<button
									type="button"
									on:click={() => copyToClipboard(link.shortLink)}
									class="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-left text-sm text-90 break-all transition-all hover:border-[var(--primary)] hover:bg-[var(--primary)]/10"
								>
									{link.shortLink}
								</button>
							</div>

							<!-- 零宽字符可视化 -->
							<div>
								<p class="mb-1 text-xs text-50">编码可视化（○=ZWSP, ●=ZWNJ）</p>
								<div class="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
									<p class="text-xs text-50 break-all font-mono">
										/s/{visualizeZwChars(link.encodedPart)}
									</p>
								</div>
							</div>

							<!-- 统计信息 -->
							<div class="flex items-center gap-4 text-xs text-50">
								<span>编码长度: {link.charCount} 个零宽字符</span>
								<span>|</span>
								<span>原始 URL: {link.targetUrl.length} 字符</span>
							</div>

							<!-- 操作按钮 -->
							<div class="flex flex-wrap gap-2">
								<button
									type="button"
									on:click={() => copyToClipboard(link.shortLink)}
									class="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-50 transition-all hover:border-[var(--primary)] hover:text-90"
								>
									复制链接
								</button>
								<button
									type="button"
									on:click={() => copyToClipboard(link.encodedPart)}
									class="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-50 transition-all hover:border-[var(--primary)] hover:text-90"
								>
									复制编码部分
								</button>
								<a
									href={link.shortLink}
									target="_blank"
									rel="noopener noreferrer"
									class="rounded-lg border border-[var(--primary)] bg-[var(--primary)]/10 px-3 py-1.5 text-xs text-[var(--primary)] transition-all hover:bg-[var(--primary)]/20"
								>
									测试跳转
								</a>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- 使用说明 -->
	<div class="rounded-2xl border border-white/10 bg-white/5 p-5">
		<h2 class="mb-3 text-lg font-bold text-90">原理说明</h2>
		<ul class="space-y-3 text-sm leading-relaxed text-50">
			<li>
				<span class="font-medium text-90">编码原理：</span>
				使用 UTF-8 零宽字符（ZWSP \u200B 和 ZWNJ \u200C）作为二进制字母表，
				将目标 URL 的每个字节编码为 8 个零宽字符。
			</li>
			<li>
				<span class="font-medium text-90">链接格式：</span>
				生成的链接格式为 <code class="px-1 bg-black/20 rounded">/s/&lt;零宽编码&gt;</code>，零宽字符在浏览器地址栏中不可见，
				所以不同 URL 生成的链接看起来完全一样（都显示为 <code class="px-1 bg-black/20 rounded">/s/</code>）。
			</li>
			<li>
				<span class="font-medium text-90">解码流程：</span>
				访问者打开链接时，前端 JavaScript 会从 URL 路径中提取零宽字符、解码还原目标 URL，然后执行跳转。
			</li>
			<li>
				<span class="font-medium text-90">注意事项：</span>
				编码后的 URL 长度约为原始 URL 的 8 倍（每个字节编码为 8 个零宽字符），
				请避免编码过长的 URL，以免超过浏览器 URL 长度限制。
			</li>
		</ul>
	</div>

	<!-- 演示区域 -->
	<div class="rounded-2xl border border-white/10 bg-white/5 p-5">
		<h2 class="mb-3 text-lg font-bold text-90">演示对比</h2>
		<p class="mb-4 text-sm text-50">
			以下两个链接视觉上完全相同（路径中的零宽字符不可见），但跳转不同目标（点击可测试）：
		</p>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<div class="rounded-xl border border-white/10 bg-black/20 p-4">
				<p class="mb-2 text-xs text-50">链接 A → example.com</p>
				<a
					href="/s/{encodeUrl('https://example.com')}"
					target="_blank"
					class="text-sm text-[var(--primary)] hover:underline"
				>
					/s/
				</a>
				<p class="mt-2 text-xs text-50 break-all font-mono">
					实际编码: {visualizeZwChars(encodeUrl('https://example.com'))}
				</p>
			</div>
			<div class="rounded-xl border border-white/10 bg-black/20 p-4">
				<p class="mb-2 text-xs text-50">链接 B → google.com</p>
				<a
					href="/s/{encodeUrl('https://google.com')}"
					target="_blank"
					class="text-sm text-[var(--primary)] hover:underline"
				>
					/s/
				</a>
				<p class="mt-2 text-xs text-50 break-all font-mono">
					实际编码: {visualizeZwChars(encodeUrl('https://google.com'))}
				</p>
			</div>
		</div>
		<p class="mt-4 text-xs text-white/45">
			两个链接都显示为 <code class="px-1 bg-black/20 rounded">/s/</code>（路径中的零宽字符完全不可见），但点击后会跳转到不同网站。
		</p>
	</div>
</div>
import Prism from "prismjs";

// 导入常用语言支持
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-nginx";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-ini";

/**
 * 高亮所有代码块
 */
export function highlightAllCodeBlocks(): void {
	const codeBlocks = document.querySelectorAll("pre code:not(.highlighted)");

	codeBlocks.forEach((block) => {
		const codeElement = block as HTMLElement;
		const preElement = codeElement.parentElement;

		if (!preElement) return;

		// 获取语言
		const className = codeElement.className;
		const languageMatch = className.match(/language-(\w+)/);
		const language = languageMatch ? languageMatch[1] : "plaintext";

		// 如果 Prism 支持该语言，进行高亮
		if (Prism.languages[language]) {
			const code = codeElement.textContent || "";
			const highlightedCode = Prism.highlight(
				code,
				Prism.languages[language],
				language,
			);
			codeElement.innerHTML = highlightedCode;
		}

		// 标记为已高亮
		codeElement.classList.add("highlighted");

		// 如果 pre 元素还没有被包裹，添加容器和复制按钮
		if (!preElement.parentElement?.classList.contains("frame")) {
			const frame = document.createElement("div");
			frame.className = "frame";

			const copyBtn = document.createElement("button");
			copyBtn.className = "copy-btn";
			copyBtn.setAttribute("aria-label", "复制代码");
			copyBtn.innerHTML = `
				<svg class="copy-btn-icon copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
					<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
				</svg>
				<svg class="copy-btn-icon success-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
					<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
				</svg>
			`;

			preElement.parentNode?.insertBefore(frame, preElement);
			frame.appendChild(preElement);
			frame.appendChild(copyBtn);
		}
	});
}

/**
 * 初始化代码高亮
 */
export function initCodeHighlight(): void {
	highlightAllCodeBlocks();
}

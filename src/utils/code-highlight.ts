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
	});
}

/**
 * 初始化代码高亮
 */
export function initCodeHighlight(): void {
	highlightAllCodeBlocks();
}

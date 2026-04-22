import { initCodeHighlight } from "@utils/code-highlight";

function setupCodeHighlight() {
	initCodeHighlight();
}

function setupCopyButton() {
	document.addEventListener(
		"click",
		function (e: MouseEvent) {
			const target = e.target as Element | null;
			if (target && target.classList.contains("copy-btn")) {
				const frame = target.closest(".frame");
				const preEle = frame?.querySelector("pre");
				const codeEle = preEle?.querySelector("code");

				// 尝试从高亮后的代码中提取文本
				let code = "";
				const codeElements = codeEle?.querySelectorAll(".code:not(summary *)");
				if (codeElements && codeElements.length > 0) {
					code = Array.from(codeElements)
						.map((el) => el.textContent)
						.map((t) => (t === "\n" ? "" : t))
						.join("\n");
				} else {
					// 如果没有 .code 元素，直接获取 code 元素的文本内容
					code = codeEle?.textContent || "";
				}

				navigator.clipboard.writeText(code);

				const timeoutId = target.getAttribute("data-timeout-id");
				if (timeoutId) {
					clearTimeout(parseInt(timeoutId));
				}

				target.classList.add("success");

				// 2秒后移除成功状态
				const newTimeoutId = setTimeout(() => {
					target.classList.remove("success");
				}, 2000);

				target.setAttribute("data-timeout-id", newTimeoutId.toString());
			}
		},
		true,
	);
}

// 初始加载
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", () => {
		setupCodeHighlight();
		setupCopyButton();
	});
} else {
	setupCodeHighlight();
	setupCopyButton();
}

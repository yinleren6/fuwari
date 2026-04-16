import { initCodeHighlight } from "@utils/code-highlight";

function setupCodeHighlight() {
	initCodeHighlight();
}

// 初始加载
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", setupCodeHighlight);
} else {
	setupCodeHighlight();
}

// SPA 导航后重新高亮
document.addEventListener("astro:page-load", setupCodeHighlight);

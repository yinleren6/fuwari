import { bindFancybox, cleanupFancybox } from "@utils/fancybox";

const SELECTOR = ".custom-md img, #post-cover img";

function initFancybox() {
	cleanupFancybox();
	bindFancybox(SELECTOR);
}

// 初始加载
initFancybox();

// SPA 导航后重新绑定
document.addEventListener("astro:page-load", initFancybox);

window.addEventListener("keydown", (e) => {
	if (e.key !== "Escape") return;
});

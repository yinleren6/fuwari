import { siteConfig } from "../config";
import {
	BANNER_HEIGHT,
	BANNER_HEIGHT_EXTEND,
	BANNER_HEIGHT_HOME,
	MAIN_PANEL_OVERLAPS_BANNER_HEIGHT,
} from "../constants/constants";
import { bindPostInlineDiff } from "../scripts/post-inline-diff";
import {
	getBgBlur,
	getHideBg,
	getHue,
	setBgBlur,
	setHideBg,
	setHue,
	setTheme,
} from "../utils/setting-utils";
import { url, pathsEqual } from "../utils/url-utils";
import {
	monitorSwupInitialization,
	setupLinkInterceptor,
} from "./swup-link-intercept";

const bannerEnabled = !!document.getElementById("banner-wrapper");

function setClickOutsideToClose(panel: string, ignores: string[]) {
	document.addEventListener("click", (event) => {
		const panelDom = document.getElementById(panel);
		const tDom = event.target;
		if (!(tDom instanceof Node)) return;
		for (const ig of ignores) {
			const ie = document.getElementById(ig);
			if (ie == tDom || ie?.contains(tDom)) {
				return;
			}
		}
		panelDom!.classList.add("float-panel-closed");
	});
}
setClickOutsideToClose("display-setting", [
	"display-setting",
	"display-settings-switch",
]);
setClickOutsideToClose("nav-menu-panel", ["nav-menu-panel", "nav-menu-switch"]);
setClickOutsideToClose("search-panel", [
	"search-panel",
	"search-bar",
	"search-bar-mobile",
	"search-bar-inside",
	"search-switch",
]);

function loadTheme() {
	setTheme();
}

function loadHue() {
	setHue(getHue());
}

function loadBgBlur() {
	setBgBlur(getBgBlur());
	setHideBg(getHideBg());
}

function showBanner() {
	if (!siteConfig.banner.enable) return;

	const banner = document.getElementById("banner");
	if (!banner) {
		console.error("Banner element not found");
		return;
	}

	banner.classList.remove("opacity-0", "scale-105");
}

function loadGiscus() {
	const container = document.getElementById("giscus-container");
	if (!container) return;

	if (
		container.querySelector("iframe.giscus-frame") ||
		container.querySelector('script[src*="giscus"]')
	)
		return;

	const script = document.createElement("script");
	script.src = "https://giscus.app/client.js";
	const attributes = [
		"data-repo",
		"data-repo-id",
		"data-category",
		"data-category-id",
		"data-mapping",
		"data-strict",
		"data-reactions-enabled",
		"data-emit-metadata",
		"data-input-position",
		"data-lang",
		"data-loading",
	];
	attributes.forEach((attr) => {
		const val = container.getAttribute(attr);
		if (val) script.setAttribute(attr, val);
	});
	script.setAttribute("data-theme", "dark");
	script.crossOrigin = "anonymous";
	script.async = true;

	container.appendChild(script);
}

function syncSidebarProfileMode() {
	const sidebar = document.getElementById("sidebar");
	const blogProfile = document.getElementById("sidebar-profile-blog");
	const forumProfile = document.getElementById("sidebar-profile-forum");
	const timetable = document.getElementById("sidebar-timetable");
	const deepwiki = document.getElementById("sidebar-deepwiki");
	
	if (!sidebar || !blogProfile || !forumProfile) return;

	const forumBasePath =
		sidebar.getAttribute("data-forum-base-path") || "/forum/";
	const currentPath = window.location.pathname;
	const normalizedCurrentPath = currentPath.endsWith("/")
		? currentPath
		: `${currentPath}/`;
	const normalizedForumBasePath = forumBasePath.endsWith("/")
		? forumBasePath
		: `${forumBasePath}/`;
	const isForumRoute =
		normalizedCurrentPath === normalizedForumBasePath ||
		normalizedCurrentPath.startsWith(normalizedForumBasePath);

	blogProfile.classList.toggle("hidden", isForumRoute);
	forumProfile.classList.toggle("hidden", !isForumRoute);
	timetable?.classList.toggle("hidden", isForumRoute);
	deepwiki?.classList.toggle("hidden", isForumRoute);
}

function isForumPath(pathname: string): boolean {
	const sidebar = document.getElementById("sidebar");
	const forumBasePath = sidebar?.getAttribute("data-forum-base-path") || "/forum/";
	const normalized = pathname.endsWith("/") ? pathname : `${pathname}/`;
	const normalizedForum = forumBasePath.endsWith("/") ? forumBasePath : `${forumBasePath}/`;
	return normalized === normalizedForum || normalized.startsWith(normalizedForum);
}

function init() {
	loadTheme();
	loadHue();
	loadBgBlur();
	showBanner();
	loadGiscus();
	syncSidebarProfileMode();

	new MutationObserver(() => {
		const frame = document.querySelector<HTMLIFrameElement>(
			"iframe.giscus-frame",
		);
		if (!frame || !frame.contentWindow) return;
		frame.contentWindow.postMessage(
			{ giscus: { setConfig: { theme: "dark" } } },
			"https://giscus.app",
		);
	}).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class"],
	});
}

init();
bindPostInlineDiff();
setupLinkInterceptor();

const setup = async () => {
	if (!window.swup) {
		return;
	}

	// 定义排序页面路径
	const SORT_PATHS = ["/", "/date-asc/", "/date-desc/", "/alpha-asc/", "/alpha-desc/"];
	
	const isSortPath = (pathname: string): boolean => {
		const clean = pathname.replace(/\/+$/, "") || "/";
		return SORT_PATHS.some((p) => {
			const cleanP = p.replace(/\/+$/, "") || "/";
			return clean === cleanP || clean.startsWith(cleanP + "/");
		});
	};

	// link:click hook - 处理点击时的准备工作
	window.swup.hooks.on("link:click", (visit: { el?: HTMLElement }) => {
		document.documentElement.style.setProperty("--content-delay", "0ms");

		if (!bannerEnabled) return;
		
		const threshold = window.innerHeight * (BANNER_HEIGHT / 100) - 72 - 16;
		const navbar = document.getElementById("navbar-wrapper");
		if (!navbar || !document.body.classList.contains("lg:is-home")) return;
		
		if (document.body.scrollTop >= threshold || document.documentElement.scrollTop >= threshold) {
			navbar.classList.add("navbar-hidden");
		}
	});

	// visit:start hook - 核心逻辑：动态控制哪些容器参与动画
	window.swup.hooks.on("visit:start", (visit: { to: { url: string }; containers?: string[] }) => {
		const bodyElement = document.querySelector("body");
		const currentPath = window.location.pathname;
		const targetPath = new URL(visit.to.url, window.location.origin).pathname;

		// 更新 body 的 is-home 类
		if (pathsEqual(visit.to.url, url("/"))) {
			bodyElement!.classList.add("lg:is-home");
		} else {
			bodyElement!.classList.remove("lg:is-home");
		}

		// 显示高度扩展元素
		const heightExtend = document.getElementById("page-height-extend");
		if (heightExtend) {
			heightExtend.classList.remove("hidden");
		}

		// TOC 准备状态
		const toc = document.getElementById("toc-wrapper");
		if (toc) {
			toc.classList.add("toc-not-ready");
		}

		// 场景1：排序页面之间的切换 - 只刷新文章列表
		if (isSortPath(currentPath) && isSortPath(targetPath)) {
			visit.containers = ["#swup-container"];
			const sortContainer = document.getElementById("sort-container");
			if (sortContainer) {
				sortContainer.classList.add("sort-keep");
			}
			return;
		}

		// 清理 sort-keep 类
		const sortContainer = document.getElementById("sort-container");
		if (sortContainer) {
			sortContainer.classList.remove("sort-keep");
		}

		// 场景2和3：判断是否涉及论坛
		const isCurrentForum = isForumPath(currentPath);
		const isTargetForum = isForumPath(targetPath);

		if (isCurrentForum || isTargetForum) {
			// 场景2：涉及论坛的切换 - sidebar 和主容器同步动画
			visit.containers = ["#swup-sidebar", "#sort-container", "#swup-container", "#swup-footer", "#toc"];
		} else {
			// 场景3：非论坛页面之间的切换 - 只有主容器动画，sidebar 不动
			visit.containers = ["#sort-container", "#swup-container", "#swup-footer", "#toc"];
		}
	});

	// page:view hook - 页面视图更新后的处理
	window.swup.hooks.on("page:view", () => {
		const heightExtend = document.getElementById("page-height-extend");
		if (heightExtend) {
			heightExtend.classList.remove("hidden");
		}
		scrollFunction();
		loadGiscus();
		syncSidebarProfileMode();
	});

	// visit:end hook - 访问结束后的清理工作
	window.swup.hooks.on("visit:end", () => {
		setTimeout(() => {
			const heightExtend = document.getElementById("page-height-extend");
			if (heightExtend) {
				heightExtend.classList.add("hidden");
			}

			const toc = document.getElementById("toc-wrapper");
			if (toc) {
				toc.classList.remove("toc-not-ready");
			}

			const sortContainer = document.getElementById("sort-container");
			if (sortContainer) {
				sortContainer.classList.remove("sort-keep");
			}
		}, 200);
	});
};

// Try to setup immediately if Swup is already ready
if (window?.swup?.hooks) {
	setup();
}

// Also listen for swup:enable event in case Swup initializes later
document.addEventListener("swup:enable", () => {
	setup();
});

let backToTopBtn = document.getElementById("back-to-top-btn");
let goToCommentsBtn = document.getElementById("go-to-comments-btn");
let toc = document.getElementById("toc-wrapper");
let navbar = document.getElementById("navbar-wrapper");
function refreshControlRefs() {
	backToTopBtn = document.getElementById("back-to-top-btn");
	goToCommentsBtn = document.getElementById("go-to-comments-btn");
	toc = document.getElementById("toc-wrapper");
	navbar = document.getElementById("navbar-wrapper");
}
function scrollFunction() {
	refreshControlRefs();
	const bannerHeight = window.innerHeight * (BANNER_HEIGHT / 100);

	if (backToTopBtn) {
		if (
			document.body.scrollTop > bannerHeight ||
			document.documentElement.scrollTop > bannerHeight
		) {
			backToTopBtn.classList.remove("hide");
		} else {
			backToTopBtn.classList.add("hide");
		}
	}

	if (goToCommentsBtn) {
		const commentsExist = !!document.getElementById("giscus-container");
		if (commentsExist) {
			goToCommentsBtn.classList.remove("hide");
		} else {
			goToCommentsBtn.classList.add("hide");
		}
	}

	if (bannerEnabled && toc) {
		if (
			document.body.scrollTop > bannerHeight ||
			document.documentElement.scrollTop > bannerHeight
		) {
			toc.classList.remove("toc-hide");
		} else {
			toc.classList.add("toc-hide");
		}
	}

	if (!bannerEnabled) return;
	if (navbar) {
		const NAVBAR_HEIGHT = 72;
		const MAIN_PANEL_EXCESS_HEIGHT = MAIN_PANEL_OVERLAPS_BANNER_HEIGHT * 16;

		let bannerHeight = BANNER_HEIGHT;
		if (
			document.body.classList.contains("lg:is-home") &&
			window.innerWidth >= 1024
		) {
			bannerHeight = BANNER_HEIGHT_HOME;
		}
		const threshold =
			window.innerHeight * (bannerHeight / 100) -
			NAVBAR_HEIGHT -
			MAIN_PANEL_EXCESS_HEIGHT -
			16;
		if (
			document.body.scrollTop >= threshold ||
			document.documentElement.scrollTop >= threshold
		) {
			navbar.classList.add("navbar-hidden");
		} else {
			navbar.classList.remove("navbar-hidden");
		}
	}
}
let scrollTicking = false;
window.onscroll = () => {
	if (!scrollTicking) {
		requestAnimationFrame(() => {
			scrollFunction();
			scrollTicking = false;
		});
		scrollTicking = true;
	}
};
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", () => {
		scrollFunction();
		syncSidebarProfileMode();
	});
} else {
	scrollFunction();
	syncSidebarProfileMode();
}

window.onresize = () => {
	let offset = Math.floor(window.innerHeight * (BANNER_HEIGHT_EXTEND / 100));
	offset = offset - (offset % 4);
	document.documentElement.style.setProperty(
		"--banner-height-extend",
		`${offset}px`,
	);
};

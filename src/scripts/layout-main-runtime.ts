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
	setBgBlur,
	setHideBg,
} from "../utils/setting-utils";

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

function syncSidebarProfileMode() {
	const sidebar = document.getElementById("sidebar");
	const blogProfile = document.getElementById("sidebar-profile-blog");
	const forumProfile = document.getElementById("sidebar-profile-forum");
	const timetable = document.getElementById("sidebar-timetable");
	const deepwiki = document.getElementById("sidebar-deepwiki");
	const mainGrid = document.getElementById("main-grid");
	const mainContent = document.getElementById("main-content");
	const footer = document.getElementById("footer");

	if (!sidebar) return;

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

	// 控制整个 sidebar 的显示/隐藏
	sidebar.classList.toggle("hidden", isForumRoute);

	// 同步 main-grid 的 grid 布局类（服务端根据 isForumRoute 渲染，客户端导航后需要同步）
	if (mainGrid) {
		const gridCols = "md:grid-cols-[17.5rem_auto]";
		const lgRows = "lg:grid-rows-[auto_1fr]";
		const mdRows = "md:grid-rows-[auto_1fr]";
		mainGrid.classList.toggle(gridCols, !isForumRoute);
		mainGrid.classList.toggle(lgRows, !isForumRoute);
		mainGrid.classList.toggle(mdRows, !isForumRoute);
	}

	// 同步 main-content 的定位类
	if (mainContent) {
		const contentClasses = [
			"lg:row-start-1", "lg:col-start-2", "lg:col-span-1",
			"md:row-start-1", "md:col-start-2", "md:col-span-1"
		];
		for (const cls of contentClasses) {
			mainContent.classList.toggle(cls, !isForumRoute);
		}
	}

	// 同步 footer 的定位类
	if (footer) {
		const footerClasses = [
			"lg:col-span-1", "lg:col-start-2", "lg:row-start-2",
			"md:col-span-1", "md:col-start-2", "md:row-start-2"
		];
		for (const cls of footerClasses) {
			footer.classList.toggle(cls, !isForumRoute);
		}
	}

	// 如果有博客/论坛 profile 切换，也保留原有逻辑
	if (blogProfile && forumProfile) {
		blogProfile.classList.toggle("hidden", isForumRoute);
		forumProfile.classList.toggle("hidden", !isForumRoute);
	}
	timetable?.classList.toggle("hidden", isForumRoute);
	deepwiki?.classList.toggle("hidden", isForumRoute);
}

function loadProfileStats() {
	const viewsElement = document.getElementById("site-views");
	const wrapper = document.getElementById("site-views-wrapper");
	if (!viewsElement) return;

	// 如果已经有数据（transition:persist 保留的），直接显示 wrapper
	if (viewsElement.textContent && viewsElement.textContent.trim() !== "") {
		if (wrapper) wrapper.style.display = "grid";
		return;
	}

	fetch("https://t.2x.nz/share?pathname=/")
		.then((response) => {
			if (!response.ok) return null;
			return response.json();
		})
		.then((data) => {
			if (!data) return;
			const pageviews = data.views || 0;
			viewsElement.textContent = pageviews.toString();
			if (wrapper) wrapper.style.display = "grid";
		})
		.catch((error) => {
			console.error("获取全站统计失败:", error);
		});
}

function init() {
	loadBgBlur();
	showBanner();
	syncSidebarProfileMode();
	loadProfileStats();

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

// 初始加载和每次页面切换后都执行
document.addEventListener("astro:page-load", () => {
	init();
	bindPostInlineDiff();
	scrollFunction();
	syncSidebarProfileMode();
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
window.onscroll = () => {
	scrollFunction();
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
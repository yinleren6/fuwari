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

function loadProfileStats() {
	const viewsElement = document.getElementById("site-views");
	if (!viewsElement) return;

	fetch("https://t.2x.nz/share?pathname=/")
		.then((response) => {
			if (!response.ok) return null;
			return response.json();
		})
		.then((data) => {
			if (!data) return;
			const pageviews = data.views || 0;
			viewsElement.textContent = pageviews.toString();
		})
		.catch((error) => {
			console.error("获取全站统计失败:", error);
		});
}

function init() {
	loadTheme();
	loadHue();
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

init();
bindPostInlineDiff();

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

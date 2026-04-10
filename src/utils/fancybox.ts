import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";

const fancyboxOptions: any = {
	hideScrollbar: false,
	animated: false,
	wheel: "zoom",
	clickContent: "close",
	dblclickContent: "zoom",
	click: "close",
	dblclick: "zoom",
	Panels: {
		display: ["counter", "zoom"],
	},
	Images: {
		panning: true,
		zoom: true,
		protect: false,
	},
};

export function bindFancybox(selector: string): void {
	Fancybox.bind(selector, fancyboxOptions);
}

export function unbindFancybox(selector: string): void {
	Fancybox.unbind(selector);
}

export function closeFancybox(): void {
	try {
		Fancybox.close();
	} catch {}
}

export function cleanupFancybox(): void {
	closeFancybox();
	document
		.querySelectorAll(".fancybox__container")
		.forEach((el) => el.remove());
}

export function restoreNativeScrollIfSafe(): void {
	const hasFancybox = !!document.querySelector(".fancybox__container");
	const hasCookieModal = !!document.querySelector(
		".cc_overlay, .cc_modal, .cc_preferences, .cc_dialog, .cc_cp, .cc_nb, .cc_banner",
	);
	if (hasFancybox || hasCookieModal) return;
}

export { fancyboxOptions };

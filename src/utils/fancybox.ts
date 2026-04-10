import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";

const FANCYBOX_CLOSING_CLASS = "fancybox-closing-radius";
const TRANSITION_DURATION = 300;

const fancyboxOptions: any = {
	hideScrollbar: false,
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
	on: {
		ready: (fancybox: any) => {
			const slide = fancybox.getSlide();
			if (slide?.triggerEl) {
				slide.triggerEl.classList.add(FANCYBOX_CLOSING_CLASS);
			}
		},
		closing: (fancybox: any) => {
			const slide = fancybox.getSlide();
			if (slide?.triggerEl) {
				slide.triggerEl.classList.add(FANCYBOX_CLOSING_CLASS);
			}
		},
		destroy: (fancybox: any) => {
			fancybox.slides?.forEach((slide: any) => {
				const triggerEl = slide.triggerEl;
				if (!triggerEl) return;
				setTimeout(() => {
					triggerEl.classList.remove(FANCYBOX_CLOSING_CLASS);
				}, TRANSITION_DURATION);
			});
		},
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

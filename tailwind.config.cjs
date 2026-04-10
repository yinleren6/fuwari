/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");
module.exports = {
	content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue,mjs}"],
	darkMode: "class", // allows toggling dark mode manually
	theme: {
		extend: {
			fontFamily: {
				sans: ["Roboto", "sans-serif", ...defaultTheme.fontFamily.sans],
			},
			typography: {
				DEFAULT: {
					css: {
						p: {
							marginTop: null,
							marginBottom: null,
						},
					},
				},
			},
		},
	},
	plugins: [
		require("@tailwindcss/typography")({
			className: "prose",
		}),
	],
};

import path from "node:path";
import { glob } from "glob";

export const CONTENT_DIR = path.join(process.cwd(), "src", "content");
export const POSTS_DIR = path.join(CONTENT_DIR, "posts");
export const SPEC_DIR = path.join(CONTENT_DIR, "spec");

function toGlobPath(targetPath) {
	return targetPath.replace(/\\/g, "/");
}

export function buildMarkdownGlob(
	targetDir,
	extensions = ["md"],
) {
	const extSet = new Set(extensions);
	const extPart = Array.from(extSet).join(",");
	return toGlobPath(path.join(targetDir, `**/*.{${extPart}}`));
}

export async function listFiles(patterns) {
	const normalized = Array.isArray(patterns) ? patterns : [patterns];
	const result = await Promise.all(
		normalized.map((pattern) => glob(pattern, { nodir: true })),
	);
	return Array.from(new Set(result.flat())).sort();
}

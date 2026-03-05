#!/usr/bin/env node

import fs from "fs";
import path from "path";
import {
	CONTENT_DIR,
	buildMarkdownGlob,
	listFiles,
} from "./utils/content-files.js";

const OLD_PATH = "../assets/images/";
const NEW_PATH = "https://cnb.cool/2x.nz/fuwari/-/git/raw/main/src/content/assets/images/";

/**
 * 获取所有 markdown 文件
 */
async function getAllMarkdownFiles() {
	try {
		return await listFiles(buildMarkdownGlob(CONTENT_DIR, ["md"]));
	} catch (error) {
		console.error("获取 markdown 文件失败:", error.message);
		return [];
	}
}

/**
 * 主函数
 */
async function cdnifyImages() {
	console.log("🔍 开始替换图片路径为 CDN URL...");

	const markdownFiles = await getAllMarkdownFiles();
	console.log(`📄 找到 ${markdownFiles.length} 个 markdown 文件`);

	let updatedCount = 0;
	let totalReplaced = 0;

	for (const file of markdownFiles) {
		try {
			const content = fs.readFileSync(file, "utf-8");
			if (content.includes(OLD_PATH)) {
				// 统计替换次数
				const occurrences = (content.match(new RegExp(OLD_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
				
				const newContent = content.replaceAll(OLD_PATH, NEW_PATH);
				fs.writeFileSync(file, newContent);
				
				console.log(`✅ 已更新: ${path.relative(process.cwd(), file)} (${occurrences} 处替换)`);
				updatedCount++;
				totalReplaced += occurrences;
			}
		} catch (error) {
			console.warn(`⚠️  读取或写入文件失败: ${file} - ${error.message}`);
		}
	}

	console.log(`\n✨ 完成！更新了 ${updatedCount} 个文件，共替换 ${totalReplaced} 处路径。`);

	// 删除 src/content/assets 文件夹
	const ASSETS_DIR_TO_DELETE = path.join(process.cwd(), "src/content/assets");
	if (fs.existsSync(ASSETS_DIR_TO_DELETE)) {
		console.log(`🗑️  正在删除 ${ASSETS_DIR_TO_DELETE}...`);
		try {
			fs.rmSync(ASSETS_DIR_TO_DELETE, { recursive: true, force: true });
			console.log("✅ src/content/assets 文件夹已成功删除。");
		} catch (error) {
			console.warn(`⚠️  删除 src/content/assets 文件夹失败: ${error.message}`);
		}
	} else {
		console.log("ℹ️  src/content/assets 文件夹不存在，无需删除。");
	}
}

// 运行脚本
cdnifyImages().catch((error) => {
	console.error("❌ 脚本执行失败:", error.message);
	process.exit(1);
});

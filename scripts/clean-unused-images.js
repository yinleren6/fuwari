#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
	CONTENT_DIR,
	POSTS_DIR,
	SPEC_DIR,
	buildMarkdownGlob,
	listFiles,
} from "./utils/content-files.js";


/**
 * 清理未使用的图片资源脚本
 * 扫描 src/content/posts 下的所有 markdown 文件，
 * 自动识别文章中引用的本地图片目录，并清理未被引用的图片
 */

// 支持的图片格式
const IMAGE_EXTENSIONS = [
	".jpg",
	".jpeg",
	".png",
	".gif",
	".webp",
	".svg",
	".avif",
];

/**
 * 获取所有 markdown 文件
 */
async function getAllMarkdownFiles() {
	try {
		return await listFiles([
			buildMarkdownGlob(POSTS_DIR, ["md"]),
			buildMarkdownGlob(SPEC_DIR, ["md"]),
		]);
	} catch (error) {
		console.error("获取 markdown 文件失败:", error.message);
		return [];
	}
}

/**
 * 获取所有图片文件（从指定目录）
 */
async function getAllImageFiles(imageDir) {
	try {
		if (!fs.existsSync(imageDir)) {
			return [];
		}
		const extensions = IMAGE_EXTENSIONS.join(",");
		const pattern = path
			.join(imageDir, `**/*{${extensions}}`)
			.replace(/\\/g, "/");
		return await listFiles(pattern);
	} catch (error) {
		console.error(`获取图片文件失败 (${imageDir}):`, error.message);
		return [];
	}
}

/**
 * 从 markdown 内容中提取图片引用
 */
function extractImageReferences(content) {
	const references = new Set();

	// 匹配 YAML frontmatter 中的 image 字段（支持带引号和不带引号的值）
	const yamlImageRegex =
		/^---[\s\S]*?image:\s*(?:['"]([^'"]+)['"]|([^\s\n]+))[\s\S]*?^---/m;
	let match = yamlImageRegex.exec(content);
	if (match) {
		// match[1] 是带引号的值，match[2] 是不带引号的值
		references.add(match[1] || match[2]);
	}

	// 匹配 HTML img 标签: <img src="path">
	const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
	while ((match = htmlImageRegex.exec(content)) !== null) {
		references.add(match[1]);
	}

	// 匹配 markdown 图片语法: ![alt](path) - 更新为支持空格
	// 标准 Markdown 图片语法: ![alt](url "title") 或 ![alt](url)
	// 我们主要关心 url 部分，它可能包含空格，但通常会被 <> 包裹或者 URL 编码
	// 但如果是本地文件引用，可能直接就是路径
	
	// 1. 匹配标准 Markdown 图片 ![...](...)
	// 修复：支持 URL 中包含一层括号，例如 image(1).png
	const markdownImageRegex = /!\[.*?\]\(((?:[^()]+|\([^()]*\))+)\)/g;
	while ((match = markdownImageRegex.exec(content)) !== null) {
		let url = match[1].trim();
		// 如果 URL 包含 title 部分 (例如 "path/to/image.png" "Title")，去除 title
		// 简单的做法是看是否有空格后跟引号
		const titleMatch = url.match(/^(\S+)\s+["'].*["']$/);
		if (titleMatch) {
			url = titleMatch[1];
		} else {
            // 处理可能的 URL 编码空格 (%20)
            try {
                url = decodeURIComponent(url);
            } catch (e) {
                // ignore
            }
        }
        
        // 移除可能存在的 <> 包裹 (CommonMark 标准允许 <path>)
        if (url.startsWith('<') && url.endsWith('>')) {
            url = url.slice(1, -1);
        }
        
		references.add(url);
	}

	// 匹配 Astro Image 组件引用
	const astroImageRegex =
		/import\s+.*?\s+from\s+["']([^"']+\.(jpg|jpeg|png|gif|webp|svg|avif))["']/gi;
	while ((match = astroImageRegex.exec(content)) !== null) {
		references.add(match[1]);
	}

	return Array.from(references);
}

/**
 * 规范化路径，处理相对路径和绝对路径
 */
function normalizePath(imagePath, markdownFilePath) {
	const projectRoot = process.cwd();
	
	// 跳过外部 URL
	if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
		return null;
	}

	// 处理以 / 开头的绝对路径
	if (imagePath.startsWith("/")) {
		// 先尝试 public 目录
		const publicPath = path.join(projectRoot, "public", imagePath);
		if (fs.existsSync(publicPath)) {
			return publicPath;
		}
		// 再尝试 src/content
		const assetsPath = path.join(projectRoot, "src/content", imagePath);
		if (fs.existsSync(assetsPath)) {
			return assetsPath;
		}
		return null;
	}

	// 处理相对路径
	if (imagePath.startsWith("./") || imagePath.startsWith("../")) {
		const markdownDir = path.dirname(markdownFilePath);
		return path.resolve(markdownDir, imagePath);
	}

	// 处理直接的文件名或相对路径
	const markdownDir = path.dirname(markdownFilePath);
	return path.resolve(markdownDir, imagePath);
}

/**
 * 从所有 markdown 文件中提取本地图片目录
 */
function extractImageDirectories(markdownFiles) {
	const imageDirs = new Set();
	const projectRoot = process.cwd();
	
	for (const mdFile of markdownFiles) {
		try {
			const content = fs.readFileSync(mdFile, "utf-8");
			const references = extractImageReferences(content);
			
			for (const ref of references) {
				// 跳过外部 URL
				if (ref.startsWith("http://") || ref.startsWith("https://")) {
					continue;
				}
				
				// 处理路径
				let imagePath;
				
				if (ref.startsWith("/")) {
					// 以 / 开头的路径，可能指向 public 或 src/content/assets
					// 先尝试 public 目录
					const publicPath = path.join(projectRoot, "public", ref);
					if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
						imagePath = publicPath;
					} else {
						// 再尝试 src/content/assets
						const assetsPath = path.join(projectRoot, "src/content", ref);
						if (fs.existsSync(assetsPath) && fs.statSync(assetsPath).isFile()) {
							imagePath = assetsPath;
						}
					}
				} else if (ref.startsWith("./") || ref.startsWith("../")) {
					// 相对路径
					const markdownDir = path.dirname(mdFile);
					imagePath = path.resolve(markdownDir, ref);
				} else {
					// 直接的文件名或相对路径
					const markdownDir = path.dirname(mdFile);
					imagePath = path.resolve(markdownDir, ref);
				}
				
				// 检查文件是否存在且是图片
				if (imagePath && fs.existsSync(imagePath) && fs.statSync(imagePath).isFile()) {
					const ext = path.extname(imagePath).toLowerCase();
					if (IMAGE_EXTENSIONS.includes(ext)) {
						// 添加图片所在的目录
						const imageDir = path.dirname(imagePath);
						imageDirs.add(imageDir);
					}
				}
			}
		} catch (error) {
			console.warn(`⚠️  读取文件失败: ${mdFile} - ${error.message}`);
		}
	}
	
	return Array.from(imageDirs);
}

/**
 * 找到所有图片目录的共同根目录
 */
function findCommonRootDirectories(imageDirs) {
	if (imageDirs.length === 0) {
		return [];
	}
	
	// 按路径深度排序，找出最顶层的目录
	const sortedDirs = imageDirs.sort((a, b) => {
		const depthA = a.split(path.sep).length;
		const depthB = b.split(path.sep).length;
		return depthA - depthB;
	});
	
	const rootDirs = new Set();
	
	for (const dir of sortedDirs) {
		// 检查是否已经有父目录在 rootDirs 中
		let hasParent = false;
		for (const rootDir of rootDirs) {
			if (dir.startsWith(rootDir + path.sep) || dir === rootDir) {
				hasParent = true;
				break;
			}
		}
		
		if (!hasParent) {
			rootDirs.add(dir);
		}
	}
	
	return Array.from(rootDirs);
}

/**
 * 主函数
 */
async function cleanUnusedImages() {
	console.log("🔍 开始扫描未使用的图片资源...");

	// 检查目录是否存在
	if (!fs.existsSync(POSTS_DIR) && !fs.existsSync(SPEC_DIR)) {
		console.error(`❌ Posts 和 Spec 目录都不存在`);
		return;
	}

	// 获取所有 markdown 文件
	const markdownFiles = await getAllMarkdownFiles();

	if (markdownFiles.length === 0) {
		console.error("❌ 未找到 markdown 文件，为避免误删，终止执行");
		return;
	}

	console.log(`📄 找到 ${markdownFiles.length} 个 markdown 文件`);

	// 从文章中提取图片目录
	console.log("� 正在分析文章中引用的图片目录...");
	const imageDirs = extractImageDirectories(markdownFiles);
	
	if (imageDirs.length === 0) {
		console.log("ℹ️  未在文章中找到本地图片引用，无需清理");
		return;
	}
	
	// 找到根目录
	const rootDirs = findCommonRootDirectories(imageDirs);
	
	console.log(`📁 找到 ${rootDirs.length} 个图片根目录:`);
	rootDirs.forEach(dir => {
		console.log(`   - ${path.relative(process.cwd(), dir)}`);
	});

	// 收集所有被引用的图片
	const referencedImages = new Set();

	for (const mdFile of markdownFiles) {
		try {
			const content = fs.readFileSync(mdFile, "utf-8");
			const references = extractImageReferences(content);

			for (const ref of references) {
				const normalizedPath = normalizePath(ref, mdFile);
				if (normalizedPath) {
					const resolvedPath = path.resolve(normalizedPath);
					referencedImages.add(resolvedPath);
				}
			}
		} catch (error) {
			console.warn(`⚠️  读取文件失败: ${mdFile} - ${error.message}`);
		}
	}

	console.log(`🔗 找到 ${referencedImages.size} 个被引用的图片`);

	// 扫描所有根目录下的图片文件
	let allImageFiles = [];
	for (const rootDir of rootDirs) {
		const images = await getAllImageFiles(rootDir);
		allImageFiles = allImageFiles.concat(images);
	}
	
	console.log(`🖼️  在目标目录中找到 ${allImageFiles.length} 个图片文件`);

	if (allImageFiles.length === 0) {
		console.log("✅ 没有找到图片文件，无需清理");
		return;
	}

	// 找出未被引用的图片
	const unusedImages = [];

	for (const imageFile of allImageFiles) {
		const resolvedImagePath = path.resolve(imageFile);
		const isReferenced = referencedImages.has(resolvedImagePath);

		if (!isReferenced) {
			unusedImages.push(imageFile);
		}
	}

	console.log(`🗑️  找到 ${unusedImages.length} 个未使用的图片`);

	if (unusedImages.length === 0) {
		console.log("✅ 所有图片都在使用中，无需清理");
		return;
	}

	// 删除未使用的图片
	let deletedCount = 0;

	for (const unusedImage of unusedImages) {
		try {
			fs.unlinkSync(unusedImage);
			console.log(`🗑️  已删除: ${path.relative(process.cwd(), unusedImage)}`);
			deletedCount++;
		} catch (error) {
			console.error(`❌ 删除失败: ${unusedImage} - ${error.message}`);
		}
	}

	// 清理空目录
	for (const rootDir of rootDirs) {
		try {
			cleanEmptyDirectories(rootDir);
		} catch (error) {
			console.warn(`⚠️  清理空目录时出错 (${rootDir}): ${error.message}`);
		}
	}

	console.log(`\n✅ 清理完成！删除了 ${deletedCount} 个未使用的图片文件`);
}

/**
 * 递归清理空目录
 */
function cleanEmptyDirectories(dir) {
	if (!fs.existsSync(dir)) return;

	const files = fs.readdirSync(dir);

	if (files.length === 0) {
		fs.rmdirSync(dir);
		console.log(`🗑️  已删除空目录: ${path.relative(process.cwd(), dir)}`);
		return;
	}

	for (const file of files) {
		const filePath = path.join(dir, file);
		if (fs.statSync(filePath).isDirectory()) {
			cleanEmptyDirectories(filePath);
		}
	}

	// 再次检查目录是否为空
	const remainingFiles = fs.readdirSync(dir);
	if (remainingFiles.length === 0) {
		fs.rmdirSync(dir);
		console.log(`🗑️  已删除空目录: ${path.relative(process.cwd(), dir)}`);
	}
}

// 运行脚本
// 检查是否直接运行此脚本
const scriptPath = fileURLToPath(import.meta.url);
const isMainModule =
	process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath);

if (isMainModule) {
	cleanUnusedImages().catch((error) => {
		console.error("❌ 脚本执行失败:", error.message);
		console.error(error.stack);
		process.exit(1);
	});
}

export { cleanUnusedImages };

// 文章列表客户端排序（仅当前页面内排序）

interface PostData {
	id: string;
	title: string;
	published: string;
	pinned?: boolean;
}

type SortType = "date" | "views";
type SortOrder = "asc" | "desc";

class PostListManager {
	private posts: PostData[] = [];
	private currentSort: SortType = "date";
	private currentOrder: SortOrder = "desc";
	private articles: HTMLElement[] = [];
	private viewsData: Map<string, number> = new Map();
	private viewsLoaded = false;

	constructor() {
		this.init();
	}

	private init() {
		if (typeof window === "undefined") return;

		this.posts = (window as any).__PAGE_POSTS_DATA__ || [];
		this.cacheArticles();
		this.bindEvents();
		this.loadViewsData();
	}

	private cacheArticles() {
		const container = document.getElementById("post-list-container");
		if (!container) return;

		this.articles = Array.from(container.querySelectorAll("article"));
	}

	private async loadViewsData() {
		// 批量获取所有文章的访问量（包含全站访问量）
		console.log('[PostListManager] 开始批量获取访问量');
		try {
			const pathnames = ["/", ...this.posts.map((post) => `/posts/${post.id}/`)];
			console.log('[PostListManager] 请求路径:', pathnames);
			
			const res = await fetch("https://t.2x.nz/batch", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(pathnames),
			});

			if (res.ok) {
				const views: number[] = await res.json();
				console.log('[PostListManager] 获取到的访问量:', views);
				
				// 第一个是全站访问量，存储到全局变量
				const siteViews = views[0] || 0;
				(window as any).__SITE_VIEWS__ = siteViews;
				console.log('[PostListManager] 设置全站访问量:', siteViews);
				
				const viewsElement = document.getElementById("site-views");
				const wrapper = document.getElementById("site-views-wrapper");
				console.log('[PostListManager] 全站访问量元素:', viewsElement, wrapper);
				if (viewsElement && wrapper) {
					viewsElement.textContent = siteViews.toString();
					wrapper.style.display = "grid";
					console.log('[PostListManager] 已更新全站访问量显示');
				}
				
				// 后续是文章访问量
				this.posts.forEach((post, index) => {
					const viewCount = views[index + 1] || 0;
					this.viewsData.set(post.id, viewCount);
					
					// 同时更新 PostMeta 组件的显示
					const postWrapper = document.getElementById(`page-views-wrapper-${post.id}`);
					const postViewsElement = document.getElementById(`page-views-${post.id}`);
					if (postWrapper && postViewsElement) {
						postViewsElement.textContent = `${viewCount} 次`;
						postWrapper.style.display = 'flex';
					}
				});
				console.log('[PostListManager] 已更新所有文章访问量');
			} else {
				console.error('[PostListManager] 请求失败:', res.status);
				// 请求失败，所有文章默认为 0
				this.posts.forEach((post) => {
					this.viewsData.set(post.id, 0);
				});
			}
		} catch (e) {
			console.error('[PostListManager] 请求异常:', e);
			// 请求失败，所有文章默认为 0
			this.posts.forEach((post) => {
				this.viewsData.set(post.id, 0);
			});
		}

		this.viewsLoaded = true;
		// 标记访问量已加载，防止 PostMeta 和 loadProfileStats 重复请求
		(window as any).__VIEWS_FETCHED__ = true;
		(window as any).__SITE_VIEWS_LOADED__ = true;
		console.log('[PostListManager] 访问量加载完成');
	}

	private bindEvents() {
		document.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;

			const sortBtn = target.closest("[data-sort-type]");
			if (sortBtn) {
				e.preventDefault();
				const type = sortBtn.getAttribute("data-sort-type") as SortType;
				this.setSort(type);
				return;
			}

			const orderBtn = target.closest("[data-sort-order]");
			if (orderBtn) {
				e.preventDefault();
				this.toggleOrder();
				return;
			}
		});
	}

	private setSort(type: SortType) {
		if (this.currentSort !== type) {
			this.currentSort = type;
			
			// 如果切换到访问量排序但数据还未加载完成，等待加载
			if (type === "views" && !this.viewsLoaded) {
				const checkInterval = setInterval(() => {
					if (this.viewsLoaded) {
						clearInterval(checkInterval);
						this.render();
					}
				}, 100);
			} else {
				this.render();
			}
		}
	}

	private toggleOrder() {
		this.currentOrder = this.currentOrder === "asc" ? "desc" : "asc";
		this.render();
	}

	private getSortedIndices(): number[] {
		const indices = this.posts.map((_, i) => i);

		indices.sort((i, j) => {
			const a = this.posts[i];
			const b = this.posts[j];

			if (this.currentSort === "date") {
				// 置顶优先
				if (a.pinned !== b.pinned) {
					return a.pinned ? -1 : 1;
				}
				const dateA = new Date(a.published).getTime();
				const dateB = new Date(b.published).getTime();
				return this.currentOrder === "desc" ? dateB - dateA : dateA - dateB;
			} else if (this.currentSort === "views") {
				const viewsA = this.viewsData.get(a.id) || 0;
				const viewsB = this.viewsData.get(b.id) || 0;
				return this.currentOrder === "desc" ? viewsB - viewsA : viewsA - viewsB;
			}

			return 0;
		});

		return indices;
	}

	private render() {
		const container = document.getElementById("post-list-container");
		if (!container || this.articles.length === 0) return;

		const sortedIndices = this.getSortedIndices();

		// 按新顺序重新插入 DOM
		sortedIndices.forEach((index) => {
			if (this.articles[index]) {
				container.appendChild(this.articles[index]);
			}
		});

		this.updateSortControls();
	}

	private updateSortControls() {
		const dateBtn = document.querySelector('[data-sort-type="date"]');
		const viewsBtn = document.querySelector('[data-sort-type="views"]');
		const orderBtn = document.querySelector("[data-sort-order]");

		if (dateBtn && viewsBtn) {
			dateBtn.classList.toggle("active", this.currentSort === "date");
			viewsBtn.classList.toggle("active", this.currentSort === "views");
		}

		if (orderBtn) {
			const icon = orderBtn.querySelector("svg");
			const text = orderBtn.querySelector("span");
			if (icon) {
				icon.classList.toggle("rotate-180", this.currentOrder === "asc");
			}
			if (text) {
				text.textContent = this.currentOrder === "desc" ? "倒序" : "正序";
			}
		}
	}
}

// 初始化
if (typeof window !== "undefined") {
	document.addEventListener("DOMContentLoaded", () => {
		new PostListManager();
	});
}

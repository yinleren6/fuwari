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
		this.loadState();
		this.bindEvents();
		this.loadViewsData().then(() => {
			this.render();
		});
	}

	private cacheArticles() {
		const container = document.getElementById("post-list-container");
		if (!container) return;

		this.articles = Array.from(container.querySelectorAll("article"));
	}

	private async loadViewsData() {
		// 批量获取所有文章的访问量
		const promises = this.posts.map(async (post) => {
			try {
				const pathname = `/posts/${post.id}/`;
				const res = await fetch(
					`https://t.2x.nz/share?pathname=${encodeURIComponent(pathname)}`,
				);
				if (res.ok) {
					const data = await res.json();
					const views = data?.views || 0;
					this.viewsData.set(post.id, views);
				}
			} catch (e) {
				// 请求失败，默认为 0
				this.viewsData.set(post.id, 0);
			}
		});

		await Promise.all(promises);
		this.viewsLoaded = true;
	}

	private loadState() {
		const saved = localStorage.getItem("post-sort-state");
		if (saved) {
			try {
				const state = JSON.parse(saved);
				this.currentSort = state.type || "date";
				this.currentOrder = state.order || "desc";
			} catch (e) {
				// ignore
			}
		}
	}

	private saveState() {
		const state = {
			type: this.currentSort,
			order: this.currentOrder,
		};
		localStorage.setItem("post-sort-state", JSON.stringify(state));
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
			this.saveState();
			
			// 如果切换到访问量排序但数据还未加载完成，显示加载提示
			if (type === "views" && !this.viewsLoaded) {
				this.showLoadingHint();
			} else {
				this.render();
			}
		}
	}

	private toggleOrder() {
		this.currentOrder = this.currentOrder === "asc" ? "desc" : "asc";
		this.saveState();
		this.render();
	}

	private showLoadingHint() {
		const container = document.getElementById("post-list-container");
		if (!container) return;
		
		container.style.opacity = "0.5";
		// 等待数据加载完成后再渲染
		const checkInterval = setInterval(() => {
			if (this.viewsLoaded) {
				clearInterval(checkInterval);
				this.render();
			}
		}, 100);
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

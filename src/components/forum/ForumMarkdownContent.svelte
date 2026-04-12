<script lang="ts">
import { renderForumMarkdown } from "@/forum/utils/markdown";
import hljs from "highlight.js";
import { afterUpdate } from "svelte";

export let content = "";
export let className = "";

export let renderedHtml = "";

$: {
	const c = content;
	renderedHtml = renderForumMarkdown(c);
}

$: classes = [
	"custom-md prose prose-invert !max-w-none break-words text-white/75",
	className,
]
	.filter(Boolean)
	.join(" ");

afterUpdate(() => {
	hljs.highlightAll();
});
</script>

<div class={classes}>
	{@html renderedHtml || "<p>暂无内容</p>"}
</div>

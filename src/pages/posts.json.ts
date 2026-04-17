import type { APIRoute } from "astro";
import { getSortedPosts } from "../utils/content-utils";

export const GET: APIRoute = async () => {
	const posts = await getSortedPosts();
	const pathnames = posts.map((post) => `/posts/${post.id}`);

	return new Response(JSON.stringify(pathnames, null, 2), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
		},
	});
};

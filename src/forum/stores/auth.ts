import type { SessionResult } from "@/forum/types/api";
import type { ForumUser } from "@/forum/types/user";
import type { Writable } from "svelte/store";
import {
	readLocalStorage,
	removeLocalStorage,
	writeLocalStorage,
} from "@/forum/utils/storage";
import { writable } from "svelte/store";

const TOKEN_STORAGE_KEY = "forum-auth-token";

interface AuthState {
	user: ForumUser | null;
	token: string | null;
	loading: boolean;
	requiresTotp: boolean;
}

interface ForumAuthStore {
	subscribe: Writable<AuthState>["subscribe"];
	setLoading(loading: boolean): void;
	setSession(session: SessionResult): void;
	clear(): void;
	getToken(): string | null;
}

function createAuthStore(): ForumAuthStore {
	const initialToken = readLocalStorage<string | null>(TOKEN_STORAGE_KEY, null);
	const { subscribe, update, set } = writable<AuthState>({
		user: null,
		token: initialToken,
		loading: false,
		requiresTotp: false,
	});

	return {
		subscribe: subscribe,
		setLoading: (loading: boolean): void =>
			update((state) => ({ ...state, loading })),
		setSession: (session: SessionResult): void => {
			if (session.token) {
				writeLocalStorage(TOKEN_STORAGE_KEY, session.token);
			}

			update((state) => {
				const nextUser = session.user
					? {
							...state.user,
							...session.user,
							id: session.user.id || state.user?.id || "",
							username: session.user.username || state.user?.username || "",
							displayName:
								session.user.displayName ||
								state.user?.displayName ||
								session.user.username ||
								state.user?.username || "",
							avatarUrl: session.user.avatarUrl || state.user?.avatarUrl,
							email: session.user.email || state.user?.email,
						}
					: state.user;

				return {
					...state,
					user: nextUser,
					token: session.token || state.token,
					requiresTotp: Boolean(session.requiresTotp),
					loading: false,
				};
			});
		},
		clear: (): void => {
			removeLocalStorage(TOKEN_STORAGE_KEY);
			set({ user: null, token: null, loading: false, requiresTotp: false });
		},
		getToken: (): string | null => readLocalStorage<string | null>(TOKEN_STORAGE_KEY, null),
	};
}

export const forumAuth: ReturnType<typeof createAuthStore> = createAuthStore();

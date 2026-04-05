function createRandomString(length: number) {
	const chars =
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	const array = new Uint8Array(length);
	crypto.getRandomValues(array);
	return Array.from(array, (value) => chars[value % chars.length]).join("");
}

export function createSecurityHeaders(): Record<string, string> {
	return {
		"X-Timestamp": Math.floor(Date.now() / 1000).toString(),
		"X-Nonce": createRandomString(16),
	};
}

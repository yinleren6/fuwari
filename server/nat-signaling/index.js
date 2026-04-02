import { WebSocket, WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;

// 存储连接信息
const clients = new Map();

// 创建WebSocket服务器
const wss = new WebSocketServer({ port: PORT });

console.log("[NAT] 信令服务器启动在端口 " + PORT);

wss.on("connection", (ws, req) => {
	const clientId = generateId();
	const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

	console.log("[NAT] 新连接: " + clientId + " 来自 " + clientIp);

	const client = {
		id: clientId,
		ws: ws,
		ip: clientIp,
		ipv4Candidates: [],
		ipv6Candidates: [],
		sdp: null,
	};

	clients.set(clientId, client);

	ws.on("message", (data) => {
		try {
			const message = JSON.parse(data.toString());
			handleMessage(client, message);
		} catch (error) {
			console.error("[NAT] 解析消息失败:", error);
			ws.send(JSON.stringify({ error: "消息格式错误" }));
		}
	});

	ws.on("close", () => {
		console.log("[NAT] 连接关闭: " + clientId);
		clients.delete(clientId);
	});

	ws.on("error", (error) => {
		console.error("[NAT] 连接错误: " + clientId, error);
		clients.delete(clientId);
	});
});

function handleMessage(client, message) {
	const keys = Object.keys(message);
	console.log("[NAT] 收到消息类型: " + keys.join(", "));

	// 处理SDP offer
	if (message.sdp) {
		client.sdp = message.sdp;

		console.log("[NAT] 收到SDP Offer");

		// 生成SDP Answer
		const answer = generateSdpAnswer(message.sdp);
		client.ws.send(JSON.stringify({ sdp: answer }));
		console.log("[NAT] 已发送SDP Answer");

		// 等待一段时间后分析结果
		setTimeout(() => {
			analyzeAndSendResult(client);
		}, 4000);
	}

	// 处理ICE候选者
	if (message["ice-candidate"]) {
		const candidate = message["ice-candidate"];
		const candidateInfo = parseIceCandidate(candidate);

		// 分类存储IPv4和IPv6候选者
		if (candidateInfo.isIpv6) {
			client.ipv6Candidates.push(candidateInfo);
			console.log("[NAT] 收到IPv6 ICE候选者: " + candidateInfo.ip);
		} else {
			client.ipv4Candidates.push(candidateInfo);
			console.log(
				"[NAT] 收到IPv4 ICE候选者: " +
					candidateInfo.ip +
					":" +
					candidateInfo.port,
			);
		}

		// 发送一个服务器端的候选者回去
		const serverCandidate = generateServerCandidate(candidateInfo);
		client.ws.send(JSON.stringify({ "ice-candidate": serverCandidate }));
	}
}

function parseIceCandidate(candidate) {
	const parts = candidate.split(" ");
	const typeIndex = parts.indexOf("typ");
	const ip = parts[4];

	return {
		foundation: parts[0]?.split(":")[1],
		component: parts[1],
		protocol: parts[2],
		priority: parts[3],
		ip: ip,
		port: Number.parseInt(parts[5]),
		type: typeIndex >= 0 ? parts[typeIndex + 1] : "unknown",
		isIpv6: ip?.includes(":"),
	};
}

function generateSdpAnswer(offerSdp) {
	let answer = offerSdp;

	// 修改setup属性为active
	answer = answer.replace(/a=setup:actpass/g, "a=setup:active");
	answer = answer.replace(/a=setup:passive/g, "a=setup:active");

	// 修改o=行
	answer = answer.replace(
		/o=- \d+ \d+ IN IP4/,
		"o=- " + Date.now() + " " + Date.now() + " IN IP4",
	);

	return answer;
}

function generateServerCandidate(clientInfo) {
	return (
		"candidate:1 1 udp 2130706431 0.0.0.0 12345 typ srflx raddr " +
		clientInfo.ip +
		" rport " +
		clientInfo.port
	);
}

function analyzeAndSendResult(client) {
	console.log("[NAT] 分析候选者...");
	console.log("[NAT] IPv4候选者: " + client.ipv4Candidates.length + " 个");
	console.log("[NAT] IPv6候选者: " + client.ipv6Candidates.length + " 个");

	const result = {};

	// 分析IPv4 NAT类型
	if (client.ipv4Candidates.length > 0) {
		const srflx4 = client.ipv4Candidates.filter((c) => c.type === "srflx");
		const publicIp = srflx4[0]?.ip || client.ipv4Candidates[0].ip;
		const uniquePorts = new Set(srflx4.map((c) => c.port));

		let natType;
		if (srflx4.length === 1) {
			natType = "Restricted Cone";
		} else if (uniquePorts.size > 1) {
			natType = "Symmetric";
		} else {
			natType = "Port Restricted Cone";
		}

		result.ipv4 = {
			nat_type: natType,
			public_ip: publicIp,
		};
		console.log("[NAT] IPv4 NAT类型: " + natType + ", 公网IP: " + publicIp);
	}

	// 分析IPv6状态
	if (client.ipv6Candidates.length > 0) {
		const srflx6 = client.ipv6Candidates.filter((c) => c.type === "srflx");
		const host6 = client.ipv6Candidates.filter((c) => c.type === "host");

		if (srflx6.length > 0 || host6.length > 0) {
			const publicIp = srflx6[0]?.ip || host6[0]?.ip;
			result.ipv6 = {
				status: "可直连",
				public_ip: publicIp,
			};
			console.log("[NAT] IPv6 公网IP: " + publicIp);
		}
	}

	// 如果没有IPv6候选者
	if (!result.ipv6) {
		result.ipv6 = {
			status: "不可用",
			public_ip: "未检测到",
		};
	}

	console.log("[NAT] 发送结果: " + JSON.stringify(result));
	client.ws.send(JSON.stringify(result));
}

function generateId() {
	return Math.random().toString(36).substring(2, 10);
}

// 优雅关闭
process.on("SIGINT", () => {
	console.log("\n[NAT] 正在关闭服务器...");
	wss.close(() => {
		console.log("[NAT] 服务器已关闭");
		process.exit(0);
	});
});

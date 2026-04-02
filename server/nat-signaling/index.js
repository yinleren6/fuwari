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
		iceCandidates: [],
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
	console.log("[NAT] 收到消息类型: " + Object.keys(message).join(", "));

	// 处理批量候选者
	if (message.type === "candidates" && Array.isArray(message.candidates)) {
		console.log("[NAT] 收到 " + message.candidates.length + " 个ICE候选者");

		for (const candidate of message.candidates) {
			const candidateInfo = parseIceCandidate(candidate);
			console.log(
				"[NAT] 候选者类型: " +
					candidateInfo.type +
					", IP: " +
					candidateInfo.ip +
					":" +
					candidateInfo.port,
			);
			client.iceCandidates.push(candidateInfo);
		}

		// 分析NAT类型
		const natResult = analyzeNatType(client);
		client.ws.send(JSON.stringify(natResult));
		console.log("[NAT] 发送结果: " + JSON.stringify(natResult));
		return;
	}

	// 兼容旧的单个候选者格式
	if (message["ice-candidate"]) {
		const candidate = message["ice-candidate"];
		const candidateInfo = parseIceCandidate(candidate);
		client.iceCandidates.push(candidateInfo);

		console.log("[NAT] 收到ICE候选者: " + candidate.substring(0, 80) + "...");
		console.log(
			"[NAT] 候选者类型: " +
				candidateInfo.type +
				", IP: " +
				candidateInfo.ip +
				":" +
				candidateInfo.port,
		);
	}
}

function parseIceCandidate(candidate) {
	const parts = candidate.split(" ");
	return {
		foundation: parts[0]?.split(":")[1],
		component: parts[1],
		protocol: parts[2],
		priority: parts[3],
		ip: parts[4],
		port: Number.parseInt(parts[5]),
		type: parts[7],
	};
}

function analyzeNatType(client) {
	const candidates = client.iceCandidates;

	console.log("[NAT] 分析 " + candidates.length + " 个候选者...");

	// 提取所有srflx候选者
	const srflxCandidates = candidates.filter((c) => c.type === "srflx");

	if (srflxCandidates.length === 0) {
		return {
			nat_type: "Blocked",
			public_ip: "未知",
		};
	}

	// 获取公网IP
	const publicIp = srflxCandidates[0].ip;

	// 检查端口是否变化（对称NAT特征）
	const uniquePorts = new Set(srflxCandidates.map((c) => c.port));

	console.log("[NAT] srflx候选者数量: " + srflxCandidates.length);
	console.log("[NAT] 不同端口数量: " + uniquePorts.size);
	console.log("[NAT] 端口列表: " + Array.from(uniquePorts).join(", "));

	let natType;

	if (srflxCandidates.length === 1) {
		// 只有一个srflx候选者，无法准确判断
		// 默认返回Restricted Cone（较常见且兼容性较好）
		natType = "Restricted Cone";
	} else if (uniquePorts.size > 1) {
		// 多个不同端口 = 对称NAT
		natType = "Symmetric";
	} else if (uniquePorts.size === 1 && srflxCandidates.length >= 3) {
		// 多个相同端口 = 端口受限锥形或受限锥形
		// 如果来自不同STUN服务器但端口相同，更可能是Port Restricted Cone
		natType = "Port Restricted Cone";
	} else {
		// 默认
		natType = "Restricted Cone";
	}

	return {
		nat_type: natType,
		public_ip: publicIp,
	};
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

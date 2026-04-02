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

	console.log(`[NAT] 新连接: ${clientId} 来自 ${clientIp}`);

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
			console.error(`[NAT] 解析消息失败:`, error);
			ws.send(JSON.stringify({ error: "消息格式错误" }));
		}
	});

	ws.on("close", () => {
		console.log(`[NAT] 连接关闭: ${clientId}`);
		clients.delete(clientId);
	});

	ws.on("error", (error) => {
		console.error(`[NAT] 连接错误: ${clientId}`, error);
		clients.delete(clientId);
	});
});

function handleMessage(client, message) {
	console.log(`[NAT] 收到消息类型: ${Object.keys(message).join(", ")}`);

	if (message["ice-candidate"]) {
		// 客户端发送ICE候选者
		const candidate = message["ice-candidate"];
		client.iceCandidates.push(candidate);

		console.log(`[NAT] 收到ICE候选者: ${candidate.substring(0, 80)}...`);

		// 解析候选者信息
		const candidateInfo = parseIceCandidate(candidate);
		console.log(
			`[NAT] 候选者类型: ${candidateInfo.type}, IP: ${candidateInfo.ip}:${candidateInfo.port}`,
		);

		// 收到srflx候选者后立即返回结果
		if (candidateInfo.type === "srflx") {
			const natResult = analyzeNatType(client, candidateInfo);
			client.ws.send(JSON.stringify(natResult));
			console.log(`[NAT] 发送结果: ${JSON.stringify(natResult)}`);
		}
	}

	if (message.type === "test-complete") {
		// 客户端测试完成，返回结果
		const natResult = analyzeNatType(client, null);
		client.ws.send(JSON.stringify(natResult));
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
		port: parts[5],
		type: parts[7],
	};
}

function analyzeNatType(client, latestCandidate) {
	const candidates = client.iceCandidates;

	console.log(`[NAT] 分析 ${candidates.length} 个候选者...`);

	// 提取所有srflx候选者
	const srflxCandidates = candidates
		.map(parseIceCandidate)
		.filter((c) => c.type === "srflx");

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

	let natType;

	if (uniquePorts.size > 1) {
		// 多个不同端口 = 对称NAT
		natType = "Symmetric";
	} else {
		// 单个端口，检查候选者数量来推断
		// 实际判断需要双向测试，这里简化处理
		natType = candidates.length <= 2 ? "Full Cone" : "Port Restricted Cone";
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

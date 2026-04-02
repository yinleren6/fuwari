<script lang="ts">
import Icon from "@iconify/svelte";

let testing = false;
let result: { natType: string; publicIp: string; description?: string } | null =
	null;
let error = "";
let iceCandidates: string[] = [];

const ICE_CONFIG: RTCConfiguration = {
	iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// 两个WebSocket端口
const WS_PORT_A = "ws://87.83.110.226:8080";
const WS_PORT_B = "ws://87.83.110.226:8081";

function isUdpSrflxCandidate(candidate: string): boolean {
	const c = candidate.toLowerCase();
	return c.includes(" udp ") && c.includes(" srflx ");
}

function generateSessionId(): string {
	return crypto.randomUUID();
}

async function startTest() {
	testing = true;
	result = null;
	error = "";
	iceCandidates = [];

	const sessionId = generateSessionId();
	let pcA: RTCPeerConnection | null = null;
	let pcB: RTCPeerConnection | null = null;
	let wsA: WebSocket | null = null;
	let wsB: WebSocket | null = null;

	try {
		// 创建两个RTCPeerConnection
		pcA = new RTCPeerConnection(ICE_CONFIG);
		pcB = new RTCPeerConnection(ICE_CONFIG);

		pcA.createDataChannel("nat-test-a");
		pcB.createDataChannel("nat-test-b");

		// ICE候选者处理
		pcA.onicecandidate = (event) => {
			if (event.candidate && isUdpSrflxCandidate(event.candidate.candidate)) {
				iceCandidates = [...iceCandidates, event.candidate.candidate];
				if (wsA?.readyState === WebSocket.OPEN) {
					wsA.send(
						JSON.stringify({
							type: "ice-candidate",
							candidate: event.candidate.candidate,
						}),
					);
				}
			}
		};

		pcB.onicecandidate = (event) => {
			if (event.candidate && isUdpSrflxCandidate(event.candidate.candidate)) {
				iceCandidates = [...iceCandidates, event.candidate.candidate];
				if (wsB?.readyState === WebSocket.OPEN) {
					wsB.send(
						JSON.stringify({
							type: "ice-candidate",
							candidate: event.candidate.candidate,
						}),
					);
				}
			}
		};

		// 连接WebSocket A
		wsA = new WebSocket(WS_PORT_A);
		await new Promise<void>((resolve, reject) => {
			wsA!.onopen = () => {
				console.log("[NAT] WS-A connected");
				wsA!.send(JSON.stringify({ type: "register", session_id: sessionId }));
				resolve();
			};
			wsA!.onerror = reject;
		});

		// 连接WebSocket B
		wsB = new WebSocket(WS_PORT_B);
		await new Promise<void>((resolve, reject) => {
			wsB!.onopen = () => {
				console.log("[NAT] WS-B connected");
				wsB!.send(JSON.stringify({ type: "register", session_id: sessionId }));
				resolve();
			};
			wsB!.onerror = reject;
		});

		// 等待注册确认
		await Promise.all([
			new Promise<void>((resolve) => {
				wsA!.onmessage = (e) => {
					const data = JSON.parse(e.data);
					if (data.type === "registered") {
						console.log("[NAT] WS-A registered");
						resolve();
					}
					handleWsMessage(data, "A");
				};
			}),
			new Promise<void>((resolve) => {
				wsB!.onmessage = (e) => {
					const data = JSON.parse(e.data);
					if (data.type === "registered") {
						console.log("[NAT] WS-B registered");
						resolve();
					}
					handleWsMessage(data, "B");
				};
			}),
		]);

		// 处理WebSocket消息的通用函数
		function handleWsMessage(data: any, side: string) {
			console.log("[NAT] Received from " + side + ":", data);

			if (data.type === "answer" && data.sdp) {
				const pc = side === "A" ? pcA : pcB;
				pc?.setRemoteDescription({ type: "answer", sdp: data.sdp });
			} else if (data.type === "ice-candidate" && data.candidate) {
				const pc = side === "A" ? pcA : pcB;
				pc?.addIceCandidate({ candidate: data.candidate, sdpMLineIndex: 0 });
			} else if (data.type === "result") {
				result = {
					natType: data.nat_type,
					publicIp: data.public_ip || "未知",
					description: data.description,
				};
			}
		}

		// 设置持续的消息处理
		wsA.onmessage = (e) => handleWsMessage(JSON.parse(e.data), "A");
		wsB.onmessage = (e) => handleWsMessage(JSON.parse(e.data), "B");

		// 创建并发送offer
		const [offerA, offerB] = await Promise.all([
			pcA.createOffer(),
			pcB.createOffer(),
		]);

		await Promise.all([
			pcA.setLocalDescription(offerA),
			pcB.setLocalDescription(offerB),
		]);

		wsA.send(JSON.stringify({ type: "offer", sdp: offerA.sdp }));
		wsB.send(JSON.stringify({ type: "offer", sdp: offerB.sdp }));

		console.log("[NAT] Offers sent");

		// 等待结果或超时
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (!result) {
					reject(new Error("测试超时"));
				}
				resolve();
			}, 15000);

			const check = setInterval(() => {
				if (result) {
					clearTimeout(timeout);
					clearInterval(check);
					resolve();
				}
			}, 100);
		});
	} catch (err) {
		console.error("[NAT] Error:", err);
		error = err instanceof Error ? err.message : "测试失败";
	} finally {
		testing = false;
		pcA?.close();
		pcB?.close();
		wsA?.close();
		wsB?.close();
	}
}

const natTypeDescriptions: Record<string, string> = {
	"Full Cone NAT": "完全锥形NAT - 最适合P2P连接",
	"Restricted Cone NAT": "受限锥形NAT - 较好的P2P兼容性",
	"Port Restricted Cone NAT": "端口受限锥形NAT - 中等P2P兼容性",
	"Symmetric NAT": "对称型NAT - P2P连接困难",
	"Full/Restricted Cone NAT": "锥形NAT - P2P兼容性较好",
	"Open Internet": "公网直连 - 无NAT",
	Blocked: "网络被阻止",
};

function getNatDescription(natType: string): string {
	return natTypeDescriptions[natType] || "未知类型";
}
</script>

<div class="space-y-6">
	<div class="flex items-center gap-2 mb-6">
		<Icon icon="material-symbols:network-check-rounded" class="text-[var(--primary)] w-7 h-7" />
		<h1 class="text-2xl font-bold text-75">NAT类型测试</h1>
	</div>

	<p class="text-sm text-50 leading-relaxed">
		检测您的网络NAT类型和公网IP地址，帮助判断P2P连接兼容性。测试需要约10-15秒。
	</p>

	<div class="flex justify-center">
		<button
			class="rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-bold text-black/80 disabled:opacity-60 transition-all"
			disabled={testing}
			on:click={startTest}
		>
			{#if testing}
				<span class="flex items-center gap-2">
					<Icon icon="svg-spinners:ring-resize" class="text-lg" />
					正在测试...
				</span>
			{:else}
				开始检测
			{/if}
		</button>
	</div>

	{#if error}
		<div class="rounded-xl border border-red-200/20 bg-red-500/10 p-4 text-red-200">
			<div class="flex items-center gap-2">
				<Icon icon="material-symbols:error-outline-rounded" />
				<span>{error}</span>
			</div>
		</div>
	{/if}

	{#if result}
		<div class="rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/10 p-6 space-y-4">
			<div class="text-center">
				<p class="text-sm text-50 mb-1">NAT类型</p>
				<p class="text-3xl font-bold text-[var(--primary)]">{result.natType}</p>
				<p class="text-sm text-50 mt-2">{result.description || getNatDescription(result.natType)}</p>
			</div>
			<div class="border-t border-white/10 pt-4 text-center">
				<p class="text-sm text-50 mb-1">公网IP</p>
				<p class="text-xl font-mono text-75">{result.publicIp}</p>
			</div>
		</div>
	{/if}

	{#if iceCandidates.length > 0 && !result}
		<div class="rounded-xl border border-white/10 p-4">
			<p class="text-sm text-50 mb-2">已收集到 {iceCandidates.length} 个ICE候选者</p>
			<div class="space-y-1 max-h-32 overflow-y-auto">
				{#each iceCandidates as candidate}
					<p class="text-xs text-40 font-mono truncate">{candidate}</p>
				{/each}
			</div>
		</div>
	{/if}

	<div class="rounded-xl border border-white/10 p-4 text-sm text-50 space-y-2">
		<p class="font-bold text-75">NAT类型说明：</p>
		<ul class="list-disc list-inside space-y-1">
			<li><span class="text-[var(--primary)]">Full Cone</span> - 完全锥形，P2P最友好</li>
			<li><span class="text-[var(--primary)]">Restricted Cone</span> - 受限锥形，需要先发送数据</li>
			<li><span class="text-[var(--primary)]">Port Restricted Cone</span> - 端口受限，需要特定端口</li>
			<li><span class="text-red-300">Symmetric</span> - 对称型，P2P困难，需中继</li>
		</ul>
	</div>
</div>

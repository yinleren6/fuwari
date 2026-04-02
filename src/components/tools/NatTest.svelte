<script lang="ts">
import Icon from "@iconify/svelte";

let testing = false;
let ipv4Result: { natType: string; publicIp: string } | null = null;
let ipv6Result: { status: string; publicIp: string } | null = null;
let error = "";
let iceCandidates: string[] = [];

// 同时支持IPv4和IPv6的STUN服务器
const ICE_CONFIG: RTCConfiguration = {
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" },
		{ urls: "stun:stun1.l.google.com:19302" },
		{ urls: "stun:stun2.l.google.com:19302" },
		{ urls: "stun:stun3.l.google.com:19302" },
		{ urls: "stun:stun4.l.google.com:19302" },
	],
};

const SIGNALING_SERVER = "ws://87.83.110.226:8080";

function isSrflxCandidate(candidate: string): boolean {
	const c = candidate.toLowerCase();
	return c.includes(" srflx ");
}

function isIpv6Candidate(candidate: string): boolean {
	// IPv6地址包含冒号
	const parts = candidate.split(" ");
	const ip = parts[4];
	return ip?.includes(":");
}

function extractCandidateInfo(candidate: string) {
	const parts = candidate.split(" ");
	const typeIndex = parts.indexOf("typ");
	return {
		ip: parts[4],
		port: Number.parseInt(parts[5]),
		type: typeIndex >= 0 ? parts[typeIndex + 1] : "unknown",
		isIpv6: parts[4]?.includes(":"),
	};
}

async function startTest() {
	testing = true;
	ipv4Result = null;
	ipv6Result = null;
	error = "";
	iceCandidates = [];

	let pc: RTCPeerConnection | null = null;
	let ws: WebSocket | null = null;

	const ipv4Candidates: string[] = [];
	const ipv6Candidates: string[] = [];

	try {
		pc = new RTCPeerConnection(ICE_CONFIG);
		pc.createDataChannel("nat-test");

		pc.onicecandidate = (event) => {
			if (event.candidate) {
				const candidateStr = event.candidate.candidate;
				console.log("[NAT] ICE candidate:", candidateStr);

				if (isSrflxCandidate(candidateStr)) {
					iceCandidates = [...iceCandidates, candidateStr];

					const info = extractCandidateInfo(candidateStr);
					if (info.isIpv6) {
						ipv6Candidates.push(candidateStr);
					} else {
						ipv4Candidates.push(candidateStr);
					}

					if (ws && ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify({ "ice-candidate": candidateStr }));
					}
				}
			} else {
				// ICE收集完成
				console.log("[NAT] ICE gathering complete");
				console.log("[NAT] IPv4 candidates:", ipv4Candidates.length);
				console.log("[NAT] IPv6 candidates:", ipv6Candidates.length);
			}
		};

		// 连接信令服务器
		ws = new WebSocket(SIGNALING_SERVER);

		ws.onopen = () => {
			console.log("[NAT] Connected to signaling server");

			// 创建offer并发送给后端
			pc?.createOffer().then((offer) => {
				ws?.send(
					JSON.stringify({
						"user-agent": navigator.userAgent,
						sdp: offer.sdp,
					}),
				);
				pc?.setLocalDescription(offer);
			});
		};

		ws.onmessage = (event) => {
			const data = JSON.parse(event.data);
			console.log("[NAT] Received:", data);

			if (data.sdp && pc) {
				pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
			} else if (data["ice-candidate"] && pc) {
				pc.addIceCandidate({
					candidate: data["ice-candidate"],
					sdpMLineIndex: 0,
				});
			} else if (data.ipv4) {
				ipv4Result = {
					natType: data.ipv4.nat_type,
					publicIp: data.ipv4.public_ip || "未知",
				};
			} else if (data.ipv6) {
				ipv6Result = {
					status: data.ipv6.status,
					publicIp: data.ipv6.public_ip || "未知",
				};
			} else if (data.nat_type) {
				// 兼容旧格式
				ipv4Result = {
					natType: data.nat_type,
					publicIp: data.public_ip || "未知",
				};
			} else if (data.error) {
				error = data.error;
				ws?.close();
			}

			// 检查是否完成
			if (ipv4Result && ipv6Result) {
				testing = false;
				ws?.close();
			}
		};

		ws.onerror = (event) => {
			console.error("[NAT] WebSocket error:", event);
			error = "信令服务器连接失败";
		};

		ws.onclose = () => {
			console.log("[NAT] WebSocket closed");
			testing = false;
			pc?.close();

			// 如果只有IPv4结果，设置IPv6为不可用
			if (ipv4Result && !ipv6Result) {
				ipv6Result = {
					status: "不可用",
					publicIp: "未检测到",
				};
			}
		};

		// 超时处理
		setTimeout(() => {
			if (testing) {
				testing = false;
				if (!ipv4Result && !ipv6Result) {
					error = "测试超时，请检查网络连接";
				} else if (!ipv6Result) {
					ipv6Result = {
						status: "不可用",
						publicIp: "未检测到",
					};
				}
				ws?.close();
				pc?.close();
			}
		}, 15000);
	} catch (err) {
		console.error("[NAT] Error:", err);
		error = err instanceof Error ? err.message : "测试失败";
		testing = false;
		pc?.close();
	}
}

const natTypeDescriptions: Record<string, string> = {
	"Full Cone": "完全锥形NAT - 最适合P2P连接",
	"Restricted Cone": "受限锥形NAT - 较好的P2P兼容性",
	"Port Restricted Cone": "端口受限锥形NAT - 中等P2P兼容性",
	Symmetric: "对称型NAT - P2P连接困难",
	Blocked: "网络被阻止",
	可直连: "IPv6公网可达，无需NAT",
	受限: "IPv6存在防火墙限制",
	不可用: "未检测到IPv6地址",
};

function getNatDescription(type: string): string {
	return natTypeDescriptions[type] || "未知类型";
}
</script>

<div class="space-y-6">
	<div class="flex items-center gap-2 mb-6">
		<Icon icon="material-symbols:network-check-rounded" class="text-[var(--primary)] w-7 h-7" />
		<h1 class="text-2xl font-bold text-75">NAT类型测试</h1>
	</div>

	<p class="text-sm text-50 leading-relaxed">
		检测您的网络NAT类型和公网IP地址，支持IPv4/IPv6双栈检测。测试需要约10-20秒。
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

	{#if ipv4Result || ipv6Result}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<!-- IPv4 结果 -->
			{#if ipv4Result}
				<div class="rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/10 p-5 space-y-3">
					<div class="flex items-center gap-2 mb-3">
						<Icon icon="material-symbols:language" class="text-[var(--primary)] w-5 h-5" />
						<span class="font-bold text-75">IPv4</span>
					</div>
					<div>
						<p class="text-xs text-50 mb-1">NAT类型</p>
						<p class="text-xl font-bold text-[var(--primary)]">{ipv4Result.natType}</p>
						<p class="text-xs text-40 mt-1">{getNatDescription(ipv4Result.natType)}</p>
					</div>
					<div class="border-t border-white/10 pt-3">
						<p class="text-xs text-50 mb-1">公网IP</p>
						<p class="text-sm font-mono text-75">{ipv4Result.publicIp}</p>
					</div>
				</div>
			{/if}

			<!-- IPv6 结果 -->
			{#if ipv6Result}
				<div class="rounded-xl border border-blue-400/25 bg-blue-400/10 p-5 space-y-3">
					<div class="flex items-center gap-2 mb-3">
						<Icon icon="material-symbols:language" class="text-blue-400 w-5 h-5" />
						<span class="font-bold text-75">IPv6</span>
					</div>
					<div>
						<p class="text-xs text-50 mb-1">状态</p>
						<p class="text-xl font-bold text-blue-400">{ipv6Result.status}</p>
						<p class="text-xs text-40 mt-1">{getNatDescription(ipv6Result.status)}</p>
					</div>
					<div class="border-t border-white/10 pt-3">
						<p class="text-xs text-50 mb-1">公网IP</p>
						<p class="text-sm font-mono text-75 break-all">{ipv6Result.publicIp}</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	{#if iceCandidates.length > 0 && !ipv4Result}
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
			<li><span class="text-blue-400">IPv6可直连</span> - 公网可达，无需NAT</li>
		</ul>
	</div>
</div>

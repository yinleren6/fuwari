<script lang="ts">
import Icon from "@iconify/svelte";

let testing = false;
let result: { natType: string; publicIp: string } | null = null;
let error = "";
let iceCandidates: string[] = [];

const ICE_CONFIG: RTCConfiguration = {
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" },
		{ urls: "stun:stun1.l.google.com:19302" },
	],
};

const SIGNALING_SERVER =
	import.meta.env.PUBLIC_NAT_SIGNALING_URL ||
	"wss://your-nat-signaling-server.com/ws";

function isUdpSrflxCandidate(candidate: string): boolean {
	const c = candidate.toLowerCase();
	return c.includes(" udp ") && c.includes(" srflx ");
}

function extractPublicIp(candidate: string): string | null {
	const parts = candidate.split(" ");
	const ipIndex = parts.findIndex((p) => p === "srflx") + 1;
	return parts[ipIndex] || null;
}

async function startTest() {
	testing = true;
	result = null;
	error = "";
	iceCandidates = [];

	let pc: RTCPeerConnection | null = null;
	let ws: WebSocket | null = null;

	try {
		pc = new RTCPeerConnection(ICE_CONFIG);
		pc.createDataChannel("nat-test");

		pc.onicecandidate = (event) => {
			if (event.candidate) {
				const candidateStr = event.candidate.candidate;
				console.log("[NAT] ICE candidate:", candidateStr);

				if (isUdpSrflxCandidate(candidateStr)) {
					iceCandidates = [...iceCandidates, candidateStr];

					if (ws && ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify({ "ice-candidate": candidateStr }));
					}
				}
			}
		};

		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);

		ws = new WebSocket(SIGNALING_SERVER);

		ws.onopen = () => {
			console.log("[NAT] Connected to signaling server");
			ws?.send(
				JSON.stringify({
					"user-agent": navigator.userAgent,
					sdp: offer.sdp,
				}),
			);
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
			} else if (data.nat_type) {
				result = {
					natType: data.nat_type,
					publicIp: data.public_ip || "未知",
				};
				ws?.close();
			} else if (data.error) {
				error = data.error;
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
		};

		// 超时处理
		setTimeout(() => {
			if (testing && !result && !error) {
				error = "测试超时，请检查网络连接";
				ws?.close();
				pc?.close();
			}
		}, 30000);
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
		检测您的网络NAT类型和公网IP地址，帮助判断P2P连接兼容性。测试需要约10-20秒。
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
				<p class="text-sm text-50 mt-2">{getNatDescription(result.natType)}</p>
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

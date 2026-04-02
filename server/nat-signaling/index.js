/**
 * NAT 类型检测服务器 — 支持 RFC 3489 全部 4 种 NAT 类型
 *
 * 检测原理
 * ─────────────────────────────────────────────────────────────
 * 测试1 连通性:  任何 srflx 候选者都存在 → UDP 未被封锁
 *               host.ip == srflx.ip  → Open Internet (无 NAT)
 *
 * 测试2 对称性:  客户端同时连接 WS_PORT_A 和 WS_PORT_B，
 *               比较两条连接产生的外部映射端口：
 *               端口不同 → Symmetric NAT
 *               端口相同 → 锥形 NAT（继续测试3）
 *
 * 测试3 锥形子类型:
 *               得知客户端外部地址后，服务器用探针套接字
 *               (UDP_PROBE_PORT) 主动向其发送 STUN Binding Request。
 *               该请求携带与正式 ICE 会话相同的凭据，使客户端
 *               ICE Agent 能识别并回复 STUN Binding Response：
 *               · 收到响应 → Full Cone 或 Restricted Cone
 *               · 无响应   → Port Restricted Cone
 *               Full vs Restricted 的区分需要第二个服务器 IP（SERVER_IP_2），
 *               若未配置则统一报告为 "Full/Restricted Cone"。
 *
 * 环境变量
 * ─────────────────────────────────────────────────────────────
 *   PORT         主 WebSocket 端口（默认 8080）；次端口自动为 PORT+1
 *   SERVER_IP    服务器公网 IP（必填）
 *   SERVER_IP_2  第二服务器 IP（可选，用于区分 Full/Restricted Cone）
 *
 * 客户端协议（前端需按此顺序操作）
 * ─────────────────────────────────────────────────────────────
 * 1. 生成 sessionId = crypto.randomUUID()
 * 2. 同时建立两条 WebSocket 连接: ws://host:PORT  和  ws://host:PORT+1
 * 3. 两条连接均发送: { type:"register", session_id }
 * 4. 每条连接收到 { type:"registered" } 后，建立 RTCPeerConnection
 * 5. 收集到 ICE 候选者后发送: { type:"ice-candidate", candidate: cand.candidate }
 * 6. 本地 SDP offer 就绪后发送: { type:"offer", sdp: offer.sdp }
 * 7. 等待 { type:"result", nat_type, public_ip, ... }
 */

import { WebSocketServer, WebSocket } from "ws";
import dgram from "dgram";
import crypto from "crypto";

// ─── 配置 ────────────────────────────────────────────────────────────────────

const BASE_PORT    = parseInt(process.env.PORT || "8080");
const WS_PORT_A    = BASE_PORT;
const WS_PORT_B    = BASE_PORT + 1;
const UDP_PORT_A   = BASE_PORT + 10;   // ICE 主端口（对应服务器 A）
const UDP_PORT_B   = BASE_PORT + 11;   // ICE 次端口（对应服务器 B）
const UDP_PROBE    = BASE_PORT + 12;   // 探针端口（用于 Port Restricted 检测）
const UDP_PROBE_2  = BASE_PORT + 13;   // 探针端口2（用于 Full vs Restricted 区分，需 SERVER_IP_2）

const SERVER_IP    = process.env.SERVER_IP;
const SERVER_IP_2  = process.env.SERVER_IP_2 ?? null; // 可选：第二服务器 IP

if (!SERVER_IP) {
  console.error("[NAT] 错误: 必须设置环境变量 SERVER_IP（服务器公网 IP）");
  process.exit(1);
}

// 探针超时：等待 STUN 响应的最长时间（ms）
const PROBE_TIMEOUT_MS = 2500;
// 总分析超时：等待两端 srflx 候选者的最长时间（ms）
const ANALYSIS_TIMEOUT_MS = 8000;

// ─── 会话存储 ─────────────────────────────────────────────────────────────────

/** @type {Map<string, Session>} */
const sessions = new Map();

/**
 * @typedef {Object} Session
 * @property {string}   id
 * @property {WebSocket|null} wsA
 * @property {WebSocket|null} wsB
 * @property {CandidateInfo[]} srflxA
 * @property {CandidateInfo[]} srflxB
 * @property {string|null} hostIp
 * @property {string|null} iceUfragLocal   - 客户端在 offer SDP 中声明的 ice-ufrag
 * @property {string|null} icePassword     - 客户端在 offer SDP 中声明的 ice-pwd
 * @property {boolean} probeReceived       - 探针1（同 IP 不同端口）是否被接收
 * @property {boolean} probe2Received      - 探针2（不同 IP）是否被接收
 * @property {ReturnType<setTimeout>|null} analysisTimer
 * @property {boolean} done
 */

// ─── UDP 套接字 ───────────────────────────────────────────────────────────────

const udpA      = dgram.createSocket("udp4");
const udpB      = dgram.createSocket("udp4");
const udpProbe  = dgram.createSocket("udp4");
const udpProbe2 = SERVER_IP_2 ? dgram.createSocket("udp4") : null;

/**
 * 绑定 UDP 套接字，返回 Promise
 * @param {dgram.Socket} socket
 * @param {number} port
 * @param {string} label
 */
function bindUdp(socket, port, label) {
  return new Promise((resolve, reject) => {
    socket.on("error", reject);
    socket.bind(port, () => {
      console.log(`[NAT] UDP[${label}] 绑定端口 ${port}`);
      resolve();
    });
  });
}

/**
 * 监听探针套接字的响应（STUN Binding Response），
 * 并将接收结果写入对应会话。
 *
 * @param {dgram.Socket} socket
 * @param {"probe"|"probe2"} probeKey
 */
function setupProbeListener(socket, probeKey) {
  socket.on("message", (msg, rinfo) => {
    const senderAddr = `${rinfo.address}:${rinfo.port}`;
    console.log(`[NAT] UDP[${probeKey}] 收到来自 ${senderAddr} 的响应`);

    for (const session of sessions.values()) {
      // 比较客户端外部 IP 是否匹配（端口可能因 Cone 类型不同而不同）
      if (rinfo.address === session.srflxA[0]?.ip || rinfo.address === session.srflxB[0]?.ip) {
        if (probeKey === "probe")  session.probeReceived  = true;
        if (probeKey === "probe2") session.probe2Received = true;
        console.log(`[NAT] 会话[${session.id}] ${probeKey} 探针命中`);
        // 提前触发分析
        analyzeSession(session.id);
      }
    }
  });
}

setupProbeListener(udpProbe, "probe");
if (udpProbe2) setupProbeListener(udpProbe2, "probe2");

// ─── WebSocket 服务器 ─────────────────────────────────────────────────────────

const wssA = new WebSocketServer({ port: WS_PORT_A });
const wssB = new WebSocketServer({ port: WS_PORT_B });

wssA.on("connection", (ws, req) => handleConnection(ws, req, "A", UDP_PORT_A));
wssB.on("connection", (ws, req) => handleConnection(ws, req, "B", UDP_PORT_B));

/**
 * 处理新 WebSocket 连接
 * @param {WebSocket} ws
 * @param {import("http").IncomingMessage} req
 * @param {"A"|"B"} side
 * @param {number} udpPort
 */
function handleConnection(ws, req, side, udpPort) {
  const clientIp = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .split(",")[0].trim();

  console.log(`[NAT] 新连接[${side}] 来自 ${clientIp}`);

  ws._side    = side;
  ws._udpPort = udpPort;

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "消息格式错误" }));
      return;
    }
    handleMessage(ws, msg);
  });

  ws.on("close", () => console.log(`[NAT] 连接关闭[${side}]`));
  ws.on("error", (e) => console.error(`[NAT] 连接错误[${side}]:`, e.message));
}

/**
 * 处理 WebSocket 消息
 * @param {WebSocket} ws
 * @param {object} msg
 */
function handleMessage(ws, msg) {
  // ── register ──────────────────────────────────────────────────────────────
  if (msg.type === "register") {
    const { session_id } = msg;
    if (!session_id) return;

    ws._sessionId = session_id;

    if (!sessions.has(session_id)) {
      sessions.set(session_id, createSession(session_id));
    }

    const session = sessions.get(session_id);
    session[`ws${ws._side}`] = ws;

    ws.send(JSON.stringify({ type: "registered", session_id }));
    console.log(`[NAT] 会话[${session_id}] 已注册服务器${ws._side}`);
    return;
  }

  const session = ws._sessionId ? sessions.get(ws._sessionId) : null;

  // ── offer ─────────────────────────────────────────────────────────────────
  if (msg.type === "offer" && msg.sdp) {
    if (session) {
      // 保存客户端 ICE 凭据，供探针 STUN 请求使用
      session.iceUfragLocal = extractSdpAttr(msg.sdp, "ice-ufrag") ?? session.iceUfragLocal;
      session.icePassword   = extractSdpAttr(msg.sdp, "ice-pwd")   ?? session.icePassword;
    }

    const answer = generateSdpAnswer(msg.sdp);
    ws.send(JSON.stringify({ type: "answer", sdp: answer }));

    // 立即发送主 ICE 候选者
    const mainCandidate = buildIceCandidate(SERVER_IP, ws._udpPort, 1);
    ws.send(JSON.stringify({ type: "ice-candidate", candidate: mainCandidate }));

    console.log(`[NAT] SDP Answer + 主 ICE 候选者 已发送[${ws._side}]`);
    return;
  }

  // ── ice-candidate ─────────────────────────────────────────────────────────
  if (msg.type === "ice-candidate" && msg.candidate) {
    const info = parseIceCandidate(msg.candidate);

    console.log(`[NAT] ICE候选者[${ws._side}]: type=${info.type} ${info.ip}:${info.port}`);

    if (!session) return;

    // 记录本地 host IP（用于判断 Open Internet）
    if (info.type === "host" && !info.ip.includes(":")) {
      session.hostIp ??= info.ip;
    }

    // 只关心 IPv4 srflx 候选者
    if (info.type === "srflx" && !info.ip.includes(":")) {
      if (ws._side === "A") session.srflxA.push(info);
      if (ws._side === "B") session.srflxB.push(info);

      // 拿到第一个 srflx 时，向客户端外部地址发探针（仅一次）
      if (session.srflxA.length + session.srflxB.length === 1) {
        scheduleProbe(session);
      }

      scheduleAnalysis(ws._sessionId);
    }

    return;
  }
}

// ─── 探针发送 ─────────────────────────────────────────────────────────────────

/**
 * 在拿到客户端外部地址后，从探针端口主动发送 STUN Binding Request。
 * 若 NAT 不是 Port Restricted，客户端 ICE Agent 会响应，
 * 探针套接字就能收到 STUN Binding Response。
 *
 * @param {Session} session
 */
function scheduleProbe(session) {
  // 延迟 800ms，让 srflx 候选者有机会从两端到达
  setTimeout(() => sendProbes(session), 800);
}

/**
 * 向客户端外部地址发送探针 STUN 请求
 * @param {Session} session
 */
function sendProbes(session) {
  const srflx = session.srflxA[0] ?? session.srflxB[0];
  if (!srflx) return;

  const { ip: publicIp, port: publicPort } = srflx;
  const ufrag    = session.iceUfragLocal ?? "probe";
  const password = session.icePassword   ?? "";

  console.log(`[NAT] 向 ${publicIp}:${publicPort} 发送探针`);

  // 探针1：来自 UDP_PROBE（同 IP，不同端口）
  const stun1 = buildStunBindingRequest(ufrag, password);
  udpProbe.send(stun1, publicPort, publicIp, (err) => {
    if (err) console.error("[NAT] 探针1 发送失败:", err.message);
  });

  // 探针2：来自 UDP_PROBE_2（不同 IP），仅在配置了第二 IP 时发送
  if (udpProbe2 && SERVER_IP_2) {
    const stun2 = buildStunBindingRequest(ufrag, password);
    udpProbe2.send(stun2, publicPort, publicIp, (err) => {
      if (err) console.error("[NAT] 探针2 发送失败:", err.message);
    });
  }
}

// ─── 分析调度 ─────────────────────────────────────────────────────────────────

/**
 * 防抖调度：收到新 srflx 候选者后，等待一段时间再分析。
 * @param {string} sessionId
 */
function scheduleAnalysis(sessionId) {
  const session = sessions.get(sessionId);
  if (!session || session.done) return;

  if (session.analysisTimer) clearTimeout(session.analysisTimer);

  const hasBoth = session.srflxA.length > 0 && session.srflxB.length > 0;
  // 两端都有候选者后，再等 PROBE_TIMEOUT_MS 让探针响应到达；
  // 否则等更长以避免过早结束
  const delay = hasBoth ? PROBE_TIMEOUT_MS : ANALYSIS_TIMEOUT_MS;

  session.analysisTimer = setTimeout(() => analyzeSession(sessionId), delay);
}

// ─── 核心分析 ─────────────────────────────────────────────────────────────────

/**
 * 根据收集到的 srflx 候选者和探针结果判断 NAT 类型
 * @param {string} sessionId
 */
function analyzeSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session || session.done) return;

  const { srflxA, srflxB, hostIp, probeReceived, probe2Received, wsA, wsB } = session;
  const allSrflx = [...srflxA, ...srflxB];

  console.log(
    `[NAT] 分析会话[${sessionId}] srflxA=${srflxA.length} srflxB=${srflxB.length}` +
    ` probe=${probeReceived} probe2=${probe2Received}`
  );

  // ── 测试1: 连通性 ────────────────────────────────────────────────────────
  if (allSrflx.length === 0) {
    return sendFinalResult(session, {
      nat_type:    "Blocked",
      public_ip:   null,
      description: "UDP 流量被完全阻断，无法建立 P2P 连接",
    });
  }

  const publicIp   = allSrflx[0].ip;
  const publicPort = allSrflx[0].port;

  // ── 测试1+: Open Internet ────────────────────────────────────────────────
  if (hostIp && hostIp === publicIp) {
    return sendFinalResult(session, {
      nat_type:    "Open Internet",
      public_ip:   publicIp,
      description: "主机直接连接公网，无 NAT",
    });
  }

  // 若两端 srflx 尚未齐全，且总超时未到，则等待
  if (srflxA.length === 0 || srflxB.length === 0) {
    // 只有单端数据时，说明客户端仅连接了一个服务器，无法做对称性测试
    if (session.done) return;
    console.log(`[NAT] 会话[${sessionId}] 仅有单端数据，等待...`);
    return;
  }

  // ── 测试2: 对称性 ────────────────────────────────────────────────────────
  const portsA = new Set(srflxA.map((c) => c.port));
  const portsB = new Set(srflxB.map((c) => c.port));

  console.log(`[NAT] 端口A: [${[...portsA]}]  端口B: [${[...portsB]}]`);

  const sharedPorts = [...portsA].filter((p) => portsB.has(p));

  if (sharedPorts.length === 0) {
    // 不同目标 → 不同外部端口 → Symmetric NAT
    return sendFinalResult(session, {
      nat_type:    "Symmetric NAT",
      public_ip:   publicIp,
      description: "对称型 NAT：每条连接分配不同外部端口，P2P 穿透困难，需中继",
      detail:      { ports_to_server_a: [...portsA], ports_to_server_b: [...portsB] },
    });
  }

  // ── 测试3: 锥形子类型 ────────────────────────────────────────────────────
  // probeReceived: 从 UDP_PROBE（同 IP，不同端口）发出的 STUN 到达了客户端并收到响应
  if (!probeReceived) {
    // 探针被 NAT 拦截 → Port Restricted Cone
    return sendFinalResult(session, {
      nat_type:    "Port Restricted Cone NAT",
      public_ip:   publicIp,
      description: "端口限制锥型 NAT：仅允许客户端曾主动联系过的 IP:端口回传数据",
    });
  }

  // 探针到达 → Full Cone 或 Restricted Cone
  if (SERVER_IP_2) {
    if (probe2Received) {
      // 来自不同 IP 的探针也到达 → Full Cone
      return sendFinalResult(session, {
        nat_type:    "Full Cone NAT",
        public_ip:   publicIp,
        description: "全锥型 NAT：任意外部地址均可主动联系客户端，P2P 穿透最容易",
      });
    } else {
      // 同 IP 不同端口可达，不同 IP 不可达 → Restricted Cone
      return sendFinalResult(session, {
        nat_type:    "Restricted Cone NAT",
        public_ip:   publicIp,
        description: "限制锥型 NAT：仅允许客户端曾主动联系过的 IP（任意端口）回传数据",
      });
    }
  }

  // 未配置第二 IP，无法区分 Full / Restricted
  return sendFinalResult(session, {
    nat_type:    "Full/Restricted Cone NAT",
    public_ip:   publicIp,
    description: "锥型 NAT（Full 或 Restricted）：配置 SERVER_IP_2 可精确区分",
  });
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * 发送最终结果给所有关联的 WebSocket 客户端
 * @param {Session} session
 * @param {object} result
 */
function sendFinalResult(session, result) {
  if (session.done) return;
  session.done = true;

  console.log(`[NAT] 结果[${session.id}]:`, result);

  const msg = JSON.stringify({ type: "result", ...result });
  [session.wsA, session.wsB].forEach((ws) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(msg);
  });

  // 30 秒后清理会话
  setTimeout(() => sessions.delete(session.id), 30_000);
}

/**
 * 创建空白会话对象
 * @param {string} id
 * @returns {Session}
 */
function createSession(id) {
  // 全局超时兜底：无论如何，N 秒后强制分析
  const globalTimer = setTimeout(() => analyzeSession(id), ANALYSIS_TIMEOUT_MS);

  return {
    id,
    wsA:            null,
    wsB:            null,
    srflxA:         [],
    srflxB:         [],
    hostIp:         null,
    iceUfragLocal:  null,
    icePassword:    null,
    probeReceived:  false,
    probe2Received: false,
    analysisTimer:  null,
    _globalTimer:   globalTimer,
    done:           false,
  };
}

/**
 * 解析 ICE 候选者字符串
 * @param {string} candidate
 * @returns {{ ip: string, port: number, type: string }}
 */
function parseIceCandidate(candidate) {
  const parts    = candidate.split(" ");
  const typeIdx  = parts.indexOf("typ");
  return {
    ip:   parts[4]  ?? "",
    port: parseInt(parts[5] ?? "0"),
    type: typeIdx >= 0 ? (parts[typeIdx + 1] ?? "unknown") : "unknown",
  };
}

/**
 * 生成服务器 ICE 候选者字符串
 * @param {string} ip
 * @param {number} port
 * @param {number} priority
 */
function buildIceCandidate(ip, port, priority) {
  // typ host：让浏览器将这个地址加入连通性检查列表
  return `candidate:${priority} 1 udp ${priority === 1 ? 2130706431 : 1862270975} ${ip} ${port} typ host`;
}

/**
 * 从 SDP 中提取指定 attribute 的值
 * @param {string} sdp
 * @param {string} attr
 * @returns {string|null}
 */
function extractSdpAttr(sdp, attr) {
  const m = sdp.match(new RegExp(`a=${attr}:([^\\r\\n]+)`));
  return m ? m[1].trim() : null;
}

/**
 * 将 SDP Offer 转换为 Answer（仅修改必要字段）
 * @param {string} offerSdp
 */
function generateSdpAnswer(offerSdp) {
  return offerSdp
    .replace(/a=setup:actpass/g, "a=setup:active")
    .replace(/a=setup:passive/g, "a=setup:active")
    .replace(/o=- \d+ \d+ IN IP4/, `o=- ${Date.now()} ${Date.now()} IN IP4`)
    .replace(/a=ice-lite\r?\n/g, "");
}

/**
 * 构建最小化 STUN Binding Request（RFC 5389），携带 MESSAGE-INTEGRITY。
 *
 * 客户端 ICE Agent 收到后会验证凭据：若凭据匹配则回复 STUN Binding Response，
 * 否则回复错误响应（但仍会到达探针套接字，可被视为"可达"的证据）。
 *
 * @param {string} ufrag    - 客户端 ICE ufrag（从 offer SDP 获取）
 * @param {string} password - 客户端 ICE password（从 offer SDP 获取）
 * @returns {Buffer}
 */
function buildStunBindingRequest(ufrag, password) {
  const MAGIC_COOKIE = 0x2112a442;
  const transactionId = crypto.randomBytes(12);

  // ── USERNAME attribute (0x0006) ──
  // ICE 探针方向：server → client，username = server_ufrag:client_ufrag
  // 这里 server ufrag 使用固定值 "probe"，client ufrag 来自 offer SDP
  const usernameStr   = `probe:${ufrag}`;
  const usernameBytes = Buffer.from(usernameStr, "utf8");
  const usernamePad   = (4 - (usernameBytes.length % 4)) % 4;
  const usernameAttr  = Buffer.alloc(4 + usernameBytes.length + usernamePad);
  usernameAttr.writeUInt16BE(0x0006, 0);
  usernameAttr.writeUInt16BE(usernameBytes.length, 2);
  usernameBytes.copy(usernameAttr, 4);

  // ── PRIORITY attribute (0x0024) ──
  const priorityAttr = Buffer.alloc(8);
  priorityAttr.writeUInt16BE(0x0024, 0);
  priorityAttr.writeUInt16BE(4, 2);
  priorityAttr.writeUInt32BE(1862270975, 4);

  // ── ICE-CONTROLLING attribute (0x802A) ──
  const iceCtrlAttr = Buffer.alloc(12);
  iceCtrlAttr.writeUInt16BE(0x802a, 0);
  iceCtrlAttr.writeUInt16BE(8, 2);
  crypto.randomBytes(8).copy(iceCtrlAttr, 4);

  const attrs      = Buffer.concat([usernameAttr, priorityAttr, iceCtrlAttr]);
  const msgLen     = attrs.length + 24; // +24 for MESSAGE-INTEGRITY attr

  // ── Header (20 bytes) ──
  const header = Buffer.alloc(20);
  header.writeUInt16BE(0x0001, 0);        // Binding Request
  header.writeUInt16BE(msgLen, 2);
  header.writeUInt32BE(MAGIC_COOKIE, 4);
  transactionId.copy(header, 8);

  // ── MESSAGE-INTEGRITY (0x0008): HMAC-SHA1 over header+attrs ──
  const preHmac   = Buffer.concat([header, attrs]);
  const hmac      = crypto.createHmac("sha1", password);
  hmac.update(preHmac);
  const digest    = hmac.digest();                 // 20 bytes

  const integrityAttr = Buffer.alloc(24);
  integrityAttr.writeUInt16BE(0x0008, 0);
  integrityAttr.writeUInt16BE(20, 2);
  digest.copy(integrityAttr, 4);

  return Buffer.concat([preHmac, integrityAttr]);
}

// ─── 启动 ─────────────────────────────────────────────────────────────────────

async function start() {
  const bindings = [
    bindUdp(udpA,     UDP_PORT_A, "A"),
    bindUdp(udpB,     UDP_PORT_B, "B"),
    bindUdp(udpProbe, UDP_PROBE,  "probe"),
  ];
  if (udpProbe2) bindings.push(bindUdp(udpProbe2, UDP_PROBE_2, "probe2"));

  await Promise.all(bindings);

  console.log(`[NAT] ══════════════════════════════`);
  console.log(`[NAT] 信令服务器A  ws://0.0.0.0:${WS_PORT_A}`);
  console.log(`[NAT] 信令服务器B  ws://0.0.0.0:${WS_PORT_B}`);
  console.log(`[NAT] UDP[A]       端口 ${UDP_PORT_A}`);
  console.log(`[NAT] UDP[B]       端口 ${UDP_PORT_B}`);
  console.log(`[NAT] UDP[探针]    端口 ${UDP_PROBE}`);
  if (udpProbe2) console.log(`[NAT] UDP[探针2]   端口 ${UDP_PROBE_2}（IP: ${SERVER_IP_2}）`);
  console.log(`[NAT] 服务器公网IP ${SERVER_IP}`);
  if (SERVER_IP_2) console.log(`[NAT] 服务器IP2    ${SERVER_IP_2}`);
  console.log(`[NAT] ══════════════════════════════`);
}

start().catch((err) => {
  console.error("[NAT] 启动失败:", err);
  process.exit(1);
});

// ─── 优雅退出 ─────────────────────────────────────────────────────────────────

process.on("SIGINT", () => {
  console.log("\n[NAT] 正在关闭服务器...");
  wssA.close();
  wssB.close();
  [udpA, udpB, udpProbe, udpProbe2].forEach((s) => s?.close());
  process.exit(0);
});
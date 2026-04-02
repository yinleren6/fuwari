package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Msg struct {
	SDP          string `json:"sdp,omitempty"`
	ICECandidate string `json:"ice-candidate,omitempty"`
}

type Result struct {
	NATType  string `json:"nat_type"`
	PublicIP string `json:"public_ip"`
}

type ClientSession struct {
	ws         *websocket.Conn
	pcA        *webrtc.PeerConnection
	pcB        *webrtc.PeerConnection
	publicIP   string
	ports      map[string]bool
	mu         sync.Mutex
	dataChanA  *webrtc.DataChannel
	dataChanB  *webrtc.DataChannel
	probeRecv  bool
}

func main() {
	http.HandleFunc("/ws", wsHandler)
	log.Println("NAT检测服务器启动在 :9000")
	http.ListenAndServe(":9000", nil)
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket升级失败:", err)
		return
	}
	defer ws.Close()

	session := &ClientSession{
		ws:      ws,
		ports:   make(map[string]bool),
		probeRecv: false,
	}

	// === 创建pcA（主连接）===
	pcA, err := webrtc.NewPeerConnection(webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
		},
	})
	if err != nil {
		log.Println("创建pcA失败:", err)
		return
	}
	session.pcA = pcA
	defer pcA.Close()

	// === 创建pcB（探测连接）===
	pcB, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		log.Println("创建pcB失败:", err)
		return
	}
	session.pcB = pcB
	defer pcB.Close()

	// === pcA接收DataChannel ===
	pcA.OnDataChannel(func(dc *webrtc.DataChannel) {
		session.dataChanA = dc
		log.Println("pcA收到DataChannel:", dc.Label())

		dc.OnOpen(func() {
			log.Println("pcA DataChannel已打开")

			// 等待3秒后开始分析
			go func() {
				time.Sleep(3 * time.Second)
				session.analyzeAndSendResult()
			}()
		})

		dc.OnMessage(func(msg webrtc.DataChannelMessage) {
			text := string(msg.Data)
			log.Println("pcA收到消息:", text)

			// 收到探测响应
			if text == "probe-ack" {
				session.mu.Lock()
				session.probeRecv = true
				session.mu.Unlock()
				log.Println("收到探测响应，可能是Restricted Cone")
			}
		})
	})

	// === pcA的ICE候选者处理 ===
	pcA.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return
		}
		candidate := c.ToJSON().Candidate
		log.Println("pcA ICE候选者:", candidate)

		// 发送给客户端
		session.ws.WriteJSON(map[string]string{
			"ice-candidate": candidate,
		})
	})

	// === pcA ICE连接状态 ===
	pcA.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		log.Println("pcA ICE状态:", state.String())
	})

	// === 处理WebSocket消息 ===
	for {
		var msg Msg
		if err := ws.ReadJSON(&msg); err != nil {
			log.Println("读取消息失败:", err)
			break
		}

		if msg.SDP != "" {
			log.Println("收到SDP Offer")
			session.handleSDP(msg.SDP)
		}

		if msg.ICECandidate != "" {
			session.handleICECandidate(msg.ICECandidate)
		}
	}
}

func (s *ClientSession) handleSDP(sdp string) {
	err := s.pcA.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  sdp,
	})
	if err != nil {
		log.Println("设置RemoteDescription失败:", err)
		return
	}

	answer, err := s.pcA.CreateAnswer(nil)
	if err != nil {
		log.Println("创建Answer失败:", err)
		return
	}

	err = s.pcA.SetLocalDescription(answer)
	if err != nil {
		log.Println("设置LocalDescription失败:", err)
		return
	}

	s.ws.WriteJSON(map[string]string{
		"sdp": answer.SDP,
	})
	log.Println("已发送SDP Answer")
}

func (s *ClientSession) handleICECandidate(candidate string) {
	err := s.pcA.AddICECandidate(webrtc.ICECandidateInit{
		Candidate: candidate,
	})
	if err != nil {
		log.Println("添加ICE候选者失败:", err)
		return
	}

	// 解析srflx候选者
	if strings.Contains(candidate, "srflx") && strings.Contains(candidate, "udp") {
		parts := strings.Split(candidate, " ")
		if len(parts) >= 6 {
			ip := parts[4]
			port := parts[5]

			// 跳过IPv6
			if !strings.Contains(ip, ":") {
				s.mu.Lock()
				s.publicIP = ip
				s.ports[port] = true
				s.mu.Unlock()
				log.Printf("记录srflx: IP=%s, Port=%s\n", ip, port)
			}
		}
	}
}

func (s *ClientSession) analyzeAndSendResult() {
	s.mu.Lock()
	defer s.mu.Unlock()

	log.Printf("分析结果: IP=%s, 端口数=%d\n", s.publicIP, len(s.ports))

	if s.publicIP == "" {
		s.sendResult("Blocked", "")
		return
	}

	// 端口超过1个，对称型NAT
	if len(s.ports) > 1 {
		s.sendResult("Symmetric", s.publicIP)
		return
	}

	// 尝试探测端口限制型
	log.Println("开始探测Port Restricted...")

	// 创建探测DataChannel
	dcB, err := s.pcB.CreateDataChannel("probe", nil)
	if err != nil {
		log.Println("创建探测DataChannel失败:", err)
		s.sendResult("Port Restricted Cone", s.publicIP)
		return
	}
	s.dataChanB = dcB

	dcB.OnOpen(func() {
		log.Println("探测DataChannel已打开，发送probe")
		dcB.SendText("probe")
	})

	dcB.OnMessage(func(msg webrtc.DataChannelMessage) {
		log.Println("探测收到消息:", string(msg.Data))
	})

	// 等待探测结果
	time.Sleep(2 * time.Second)

	// 通过pcA的DataChannel发送探测请求
	if s.dataChanA != nil {
		s.dataChanA.SendText("ping-probe")
	}

	time.Sleep(1 * time.Second)

	if s.probeRecv {
		s.sendResult("Restricted Cone", s.publicIP)
	} else {
		s.sendResult("Port Restricted Cone", s.publicIP)
	}
}

func (s *ClientSession) sendResult(natType, ip string) {
	result := Result{
		NATType:  natType,
		PublicIP: ip,
	}

	jsonData, _ := json.Marshal(result)
	log.Println("发送结果:", string(jsonData))

	s.ws.WriteJSON(result)
}

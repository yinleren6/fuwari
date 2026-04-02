package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
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

func main() {
	http.HandleFunc("/ws", wsHandler)
	log.Println("Server running :9000")
	http.ListenAndServe(":9000", nil)
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	ws, _ := upgrader.Upgrade(w, r, nil)

	// === Peer A（正常连接）===
	pcA, _ := webrtc.NewPeerConnection(webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
		},
	})

	// === Peer B（隐藏探测）===
	pcB, _ := webrtc.NewPeerConnection(webrtc.Configuration{})

	var publicIP string
	ports := make(map[string]bool)

	var dataChannelA *webrtc.DataChannel

	// === A：接收 DataChannel ===
	pcA.OnDataChannel(func(dc *webrtc.DataChannel) {
		dataChannelA = dc

		dc.OnOpen(func() {
			log.Println("A DataChannel open")

			go func() {
				time.Sleep(3 * time.Second)

				// === Symmetric 判断 ===
				if len(ports) > 1 {
					send(ws, "Symmetric NAT", publicIP)
					return
				}

				// === 启动 B 探测 ===
				testPortRestricted(pcB, dataChannelA, ws, publicIP)
			}()
		})

		dc.OnMessage(func(msg webrtc.DataChannelMessage) {
			log.Println("A 收到:", string(msg.Data))
		})
	})

	// === ICE 收集 ===
	pcA.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return
		}
		ws.WriteJSON(map[string]string{
			"ice-candidate": c.ToJSON().Candidate,
		})
	})

	// === WebSocket 接收 ===
	for {
		var msg Msg
		if err := ws.ReadJSON(&msg); err != nil {
			break
		}

		if msg.SDP != "" {
			pcA.SetRemoteDescription(webrtc.SessionDescription{
				Type: webrtc.SDPTypeOffer,
				SDP:  msg.SDP,
			})

			answer, _ := pcA.CreateAnswer(nil)
			pcA.SetLocalDescription(answer)

			ws.WriteJSON(map[string]string{
				"sdp": answer.SDP,
			})
		}

		if msg.ICECandidate != "" {
			pcA.AddICECandidate(webrtc.ICECandidateInit{
				Candidate: msg.ICECandidate,
			})

			// === 解析 srflx ===
			if strings.Contains(msg.ICECandidate, "srflx") {
				parts := strings.Split(msg.ICECandidate, " ")
				ip := parts[4]
				port := parts[5]

				publicIP = ip
				ports[port] = true
			}
		}
	}
}

// === Port Restricted 测试 ===
func testPortRestricted(pcB *webrtc.PeerConnection, dcA *webrtc.DataChannel, ws *websocket.Conn, ip string) {

	log.Println("开始 Port Restricted 测试")

	// 创建隐藏 DataChannel（不会被客户端主动连接）
	dcB, _ := pcB.CreateDataChannel("probe", nil)

	received := false

	dcB.OnOpen(func() {
		log.Println("B channel open")

		dcB.SendText("probe")
	})

	dcB.OnMessage(func(msg webrtc.DataChannelMessage) {
		if string(msg.Data) == "pong" {
			received = true
		}
	})

	// 等待结果
	time.Sleep(2 * time.Second)

	if received {
		send(ws, "Restricted Cone NAT", ip)
	} else {
		send(ws, "Port Restricted Cone NAT", ip)
	}
}

func send(ws *websocket.Conn, nat string, ip string) {
	res := Result{
		NATType:  nat,
		PublicIP: ip,
	}
	ws.WriteJSON(res)
}
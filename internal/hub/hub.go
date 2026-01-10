package hub

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/socr/o365-monitor/internal/models"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for dev
	},
}

type Hub struct {
	clients    map[*websocket.Conn]bool
	broadcast  chan interface{}
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	mu         sync.Mutex

	// Batching
	logBuffer []models.AuditLog
	bufferMu  sync.Mutex
}

var GlobalHub = &Hub{
	broadcast:  make(chan interface{}),
	register:   make(chan *websocket.Conn),
	unregister: make(chan *websocket.Conn),
	clients:    make(map[*websocket.Conn]bool),
	logBuffer:  make([]models.AuditLog, 0, 100),
}

func (h *Hub) Run() {
	ticker := time.NewTicker(500 * time.Millisecond) // Flush every 500ms
	defer ticker.Stop()

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				client.Close()
			}
			h.mu.Unlock()
		case message := <-h.broadcast:
			h.mu.Lock()
			for client := range h.clients {
				err := client.WriteJSON(message)
				if err != nil {
					log.Printf("WS Error: %v", err)
					client.Close()
					delete(h.clients, client)
				}
			}
			h.mu.Unlock()
		case <-ticker.C:
			h.flushBuffer()
		}
	}
}

func (h *Hub) flushBuffer() {
	h.bufferMu.Lock()
	defer h.bufferMu.Unlock()

	if len(h.logBuffer) == 0 {
		return
	}

	// Create a copy to broadcast
	batch := make([]models.AuditLog, len(h.logBuffer))
	copy(batch, h.logBuffer)

	// Clear buffer
	h.logBuffer = h.logBuffer[:0]

	// Send batch message
	h.broadcast <- map[string]interface{}{
		"type":    "logs", // Plural 'logs' for array payload
		"payload": batch,
	}
}

func (h *Hub) BroadcastLog(logEntry models.AuditLog) {
	h.bufferMu.Lock()
	h.logBuffer = append(h.logBuffer, logEntry)
	shouldFlush := len(h.logBuffer) >= 50 // Max batch size
	h.bufferMu.Unlock()

	if shouldFlush {
		go h.flushBuffer()
	}
}

func (h *Hub) BroadcastLogs(logs []models.AuditLog) {
	h.bufferMu.Lock()
	h.logBuffer = append(h.logBuffer, logs...)
	shouldFlush := len(h.logBuffer) >= 50
	h.bufferMu.Unlock()

	if shouldFlush {
		go h.flushBuffer()
	}
}

func (h *Hub) BroadcastAlert(alert models.Alert) {
	go func() {
		h.broadcast <- map[string]interface{}{
			"type":    "alert",
			"payload": alert,
		}
	}()
}

// ServeWS handles websocket requests from the peer.
func ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	GlobalHub.register <- conn
}

package hub

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/models"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for dev
	},
}

// Client represents a WebSocket client with org context
type Client struct {
	Conn  *websocket.Conn
	OrgID uuid.UUID
}

// Hub manages WebSocket connections with org-based rooms
type Hub struct {
	// rooms maps orgID to connected clients
	rooms      map[uuid.UUID]map[*Client]bool
	broadcast  chan broadcastMessage
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex

	// Batching per org
	logBuffers map[uuid.UUID][]models.AuditLog
	bufferMu   sync.Mutex

	// JWKS cache for token verification
	jwksCache   *JWKS
	jwksCacheMu sync.RWMutex
	cacheTime   time.Time
}

// broadcastMessage wraps a message with its target org
type broadcastMessage struct {
	OrgID   uuid.UUID
	Message interface{}
}

// JWKS and JWK for token verification
type JWKS struct {
	Keys []JWK `json:"keys"`
}

type JWK struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	N   string `json:"n"`
	E   string `json:"e"`
}

var GlobalHub = &Hub{
	rooms:      make(map[uuid.UUID]map[*Client]bool),
	broadcast:  make(chan broadcastMessage, 256),
	register:   make(chan *Client, 32),
	unregister: make(chan *Client, 32),
	logBuffers: make(map[uuid.UUID][]models.AuditLog),
}

func (h *Hub) Run(ctx context.Context) {
	ticker := time.NewTicker(500 * time.Millisecond) // Flush every 500ms
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("WebSocket hub shutting down...")
			h.closeAllClients()
			return

		case client := <-h.register:
			h.mu.Lock()
			if h.rooms[client.OrgID] == nil {
				h.rooms[client.OrgID] = make(map[*Client]bool)
			}
			h.rooms[client.OrgID][client] = true
			log.Printf("Client registered to org room: %s", client.OrgID)
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if room, ok := h.rooms[client.OrgID]; ok {
				if _, ok := room[client]; ok {
					delete(room, client)
					client.Conn.Close()
					// Clean up empty rooms
					if len(room) == 0 {
						delete(h.rooms, client.OrgID)
					}
				}
			}
			h.mu.Unlock()

		case msg := <-h.broadcast:
			h.mu.RLock()
			if room, ok := h.rooms[msg.OrgID]; ok {
				for client := range room {
					err := client.Conn.WriteJSON(msg.Message)
					if err != nil {
						log.Printf("WS Error: %v", err)
						go func(c *Client) {
							h.unregister <- c
						}(client)
					}
				}
			}
			h.mu.RUnlock()

		case <-ticker.C:
			h.flushAllBuffers()
		}
	}
}

// closeAllClients closes all connected WebSocket clients
func (h *Hub) closeAllClients() {
	h.mu.Lock()
	defer h.mu.Unlock()

	for orgID, room := range h.rooms {
		for client := range room {
			client.Conn.Close()
		}
		delete(h.rooms, orgID)
	}
	log.Println("All WebSocket clients closed")
}

func (h *Hub) flushAllBuffers() {
	h.bufferMu.Lock()
	defer h.bufferMu.Unlock()

	for orgID, buffer := range h.logBuffers {
		if len(buffer) == 0 {
			continue
		}

		// Create a copy to broadcast
		batch := make([]models.AuditLog, len(buffer))
		copy(batch, buffer)

		// Clear buffer
		h.logBuffers[orgID] = h.logBuffers[orgID][:0]

		// Send batch message to org room
		h.broadcast <- broadcastMessage{
			OrgID: orgID,
			Message: map[string]interface{}{
				"type":    "logs",
				"payload": batch,
			},
		}
	}
}

func (h *Hub) BroadcastLog(logEntry models.AuditLog, orgID uuid.UUID) {
	h.bufferMu.Lock()
	if h.logBuffers[orgID] == nil {
		h.logBuffers[orgID] = make([]models.AuditLog, 0, 100)
	}
	h.logBuffers[orgID] = append(h.logBuffers[orgID], logEntry)
	shouldFlush := len(h.logBuffers[orgID]) >= 50
	h.bufferMu.Unlock()

	if shouldFlush {
		go h.flushOrgBuffer(orgID)
	}
}

func (h *Hub) BroadcastLogs(logs []models.AuditLog, orgID uuid.UUID) {
	h.bufferMu.Lock()
	if h.logBuffers[orgID] == nil {
		h.logBuffers[orgID] = make([]models.AuditLog, 0, 100)
	}
	h.logBuffers[orgID] = append(h.logBuffers[orgID], logs...)
	shouldFlush := len(h.logBuffers[orgID]) >= 50
	h.bufferMu.Unlock()

	if shouldFlush {
		go h.flushOrgBuffer(orgID)
	}
}

func (h *Hub) flushOrgBuffer(orgID uuid.UUID) {
	h.bufferMu.Lock()
	buffer := h.logBuffers[orgID]
	if len(buffer) == 0 {
		h.bufferMu.Unlock()
		return
	}

	batch := make([]models.AuditLog, len(buffer))
	copy(batch, buffer)
	h.logBuffers[orgID] = h.logBuffers[orgID][:0]
	h.bufferMu.Unlock()

	h.broadcast <- broadcastMessage{
		OrgID: orgID,
		Message: map[string]interface{}{
			"type":    "logs",
			"payload": batch,
		},
	}
}

func (h *Hub) BroadcastAlert(alert models.Alert, orgID uuid.UUID) {
	go func() {
		h.broadcast <- broadcastMessage{
			OrgID: orgID,
			Message: map[string]interface{}{
				"type":    "alert",
				"payload": alert,
			},
		}
	}()
}

func (h *Hub) BroadcastHealth(stats map[string]interface{}) {
	// Health messages go to all connected clients
	h.mu.RLock()
	defer h.mu.RUnlock()

	msg := map[string]interface{}{
		"type":    "health",
		"payload": stats,
	}

	for _, room := range h.rooms {
		for client := range room {
			err := client.Conn.WriteJSON(msg)
			if err != nil {
				go func(c *Client) {
					h.unregister <- c
				}(client)
			}
		}
	}
}

// ServeWS handles websocket requests with JWT authentication
func ServeWS(w http.ResponseWriter, r *http.Request) {
	// Get token from query param
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}

	// Verify token and extract org ID
	orgID, err := GlobalHub.verifyTokenAndGetOrgID(token)
	if err != nil {
		log.Printf("WebSocket auth failed: %v", err)
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	client := &Client{
		Conn:  conn,
		OrgID: orgID,
	}

	GlobalHub.register <- client

	// Handle client disconnect
	go func() {
		defer func() {
			GlobalHub.unregister <- client
		}()
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	}()
}

// verifyTokenAndGetOrgID verifies the JWT and returns the organization ID
func (h *Hub) verifyTokenAndGetOrgID(tokenString string) (uuid.UUID, error) {
	jwks, err := h.getJWKS()
	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to fetch JWKS: %w", err)
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		kid, ok := token.Header["kid"].(string)
		if !ok {
			return nil, fmt.Errorf("missing kid in token header")
		}

		for _, key := range jwks.Keys {
			if key.Kid == kid {
				return h.jwkToPublicKey(key)
			}
		}

		return nil, fmt.Errorf("no matching key found for kid: %s", kid)
	})

	if err != nil {
		return uuid.Nil, err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return uuid.Nil, fmt.Errorf("invalid token claims")
	}

	// Extract Clerk org_id
	clerkOrgID, _ := claims["org_id"].(string)
	if clerkOrgID == "" {
		if orgClaim, ok := claims["org"].(map[string]interface{}); ok {
			clerkOrgID, _ = orgClaim["id"].(string)
		}
	}

	if clerkOrgID == "" {
		return uuid.Nil, fmt.Errorf("no organization context in token")
	}

	// Look up internal org ID
	var org models.Organization
	if err := database.DB.Where("clerk_org_id = ?", clerkOrgID).First(&org).Error; err != nil {
		return uuid.Nil, fmt.Errorf("organization not found: %w", err)
	}

	return org.ID, nil
}

func (h *Hub) getJWKS() (*JWKS, error) {
	h.jwksCacheMu.RLock()
	if h.jwksCache != nil && time.Since(h.cacheTime) < time.Hour {
		defer h.jwksCacheMu.RUnlock()
		return h.jwksCache, nil
	}
	h.jwksCacheMu.RUnlock()

	h.jwksCacheMu.Lock()
	defer h.jwksCacheMu.Unlock()

	if h.jwksCache != nil && time.Since(h.cacheTime) < time.Hour {
		return h.jwksCache, nil
	}

	clerkFrontendAPI := os.Getenv("CLERK_FRONTEND_API")
	if clerkFrontendAPI == "" {
		clerkFrontendAPI = "https://clerk.your-domain.com"
	}

	jwksURL := clerkFrontendAPI + "/.well-known/jwks.json"

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(jwksURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS request failed: %d", resp.StatusCode)
	}

	var jwks JWKS
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, err
	}

	h.jwksCache = &jwks
	h.cacheTime = time.Now()

	return &jwks, nil
}

func (h *Hub) jwkToPublicKey(jwk JWK) (*rsa.PublicKey, error) {
	if jwk.Kty != "RSA" {
		return nil, fmt.Errorf("unsupported key type: %s", jwk.Kty)
	}

	nBytes, err := base64.RawURLEncoding.DecodeString(jwk.N)
	if err != nil {
		return nil, err
	}
	n := new(big.Int).SetBytes(nBytes)

	eBytes, err := base64.RawURLEncoding.DecodeString(jwk.E)
	if err != nil {
		return nil, err
	}
	e := new(big.Int).SetBytes(eBytes)

	return &rsa.PublicKey{
		N: n,
		E: int(e.Int64()),
	}, nil
}

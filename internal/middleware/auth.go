package middleware

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
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/models"
)

// Context keys for organization data
type contextKey string

const (
	OrgIDKey      contextKey = "org_id"
	ClerkOrgIDKey contextKey = "clerk_org_id"
	UserIDKey     contextKey = "user_id"
)

// JWKS represents the JSON Web Key Set from Clerk
type JWKS struct {
	Keys []JWK `json:"keys"`
}

// JWK represents a single JSON Web Key
type JWK struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// ClerkAuth is the authentication middleware for Clerk JWT verification
type ClerkAuth struct {
	jwksURL     string
	jwksCache   *JWKS
	jwksCacheMu sync.RWMutex
	cacheTime   time.Time
	cacheTTL    time.Duration
}

// NewClerkAuth creates a new ClerkAuth middleware instance
func NewClerkAuth() *ClerkAuth {
	// Clerk JWKS URL is derived from the frontend API domain
	// Format: https://{clerk-frontend-api}/.well-known/jwks.json
	clerkFrontendAPI := os.Getenv("CLERK_FRONTEND_API")
	if clerkFrontendAPI == "" {
		// Default to a placeholder - should be set in production
		clerkFrontendAPI = "https://clerk.your-domain.com"
	}

	return &ClerkAuth{
		jwksURL:  clerkFrontendAPI + "/.well-known/jwks.json",
		cacheTTL: 1 * time.Hour,
	}
}

// Middleware returns the HTTP middleware function
func (ca *ClerkAuth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error": "missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			http.Error(w, `{"error": "invalid authorization header format"}`, http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]

		// Parse and validate the JWT
		token, err := ca.parseAndValidateToken(tokenString)
		if err != nil {
			log.Printf("Token validation failed: %v", err)
			http.Error(w, fmt.Sprintf(`{"error": "invalid token: %s"}`, err.Error()), http.StatusUnauthorized)
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || !token.Valid {
			http.Error(w, `{"error": "invalid token claims"}`, http.StatusUnauthorized)
			return
		}

		// Extract Clerk org_id from claims
		clerkOrgID, _ := claims["org_id"].(string)
		if clerkOrgID == "" {
			// Try alternate claim locations
			if orgClaim, ok := claims["org"].(map[string]interface{}); ok {
				clerkOrgID, _ = orgClaim["id"].(string)
			}
		}

		if clerkOrgID == "" {
			http.Error(w, `{"error": "no organization context in token"}`, http.StatusForbidden)
			return
		}

		// Extract user ID from claims
		userID, _ := claims["sub"].(string)

		// Look up or create the internal organization
		org, err := ca.getOrCreateOrganization(clerkOrgID)
		if err != nil {
			log.Printf("Failed to get/create organization: %v", err)
			http.Error(w, `{"error": "organization lookup failed"}`, http.StatusInternalServerError)
			return
		}

		// Inject organization context into request
		ctx := r.Context()
		ctx = context.WithValue(ctx, OrgIDKey, org.ID)
		ctx = context.WithValue(ctx, ClerkOrgIDKey, clerkOrgID)
		ctx = context.WithValue(ctx, UserIDKey, userID)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// parseAndValidateToken parses and validates the JWT token
func (ca *ClerkAuth) parseAndValidateToken(tokenString string) (*jwt.Token, error) {
	// Fetch JWKS if not cached or cache expired
	jwks, err := ca.getJWKS()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch JWKS: %w", err)
	}

	// Parse the token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		// Get the key ID from the token header
		kid, ok := token.Header["kid"].(string)
		if !ok {
			return nil, fmt.Errorf("missing kid in token header")
		}

		// Find the matching key in JWKS
		for _, key := range jwks.Keys {
			if key.Kid == kid {
				return ca.jwkToPublicKey(key)
			}
		}

		return nil, fmt.Errorf("no matching key found for kid: %s", kid)
	})

	return token, err
}

// getJWKS fetches and caches the JWKS
func (ca *ClerkAuth) getJWKS() (*JWKS, error) {
	ca.jwksCacheMu.RLock()
	if ca.jwksCache != nil && time.Since(ca.cacheTime) < ca.cacheTTL {
		defer ca.jwksCacheMu.RUnlock()
		return ca.jwksCache, nil
	}
	ca.jwksCacheMu.RUnlock()

	// Fetch new JWKS
	ca.jwksCacheMu.Lock()
	defer ca.jwksCacheMu.Unlock()

	// Double-check after acquiring write lock
	if ca.jwksCache != nil && time.Since(ca.cacheTime) < ca.cacheTTL {
		return ca.jwksCache, nil
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(ca.jwksURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS request failed with status: %d", resp.StatusCode)
	}

	var jwks JWKS
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, fmt.Errorf("failed to decode JWKS: %w", err)
	}

	ca.jwksCache = &jwks
	ca.cacheTime = time.Now()

	return &jwks, nil
}

// jwkToPublicKey converts a JWK to an RSA public key
func (ca *ClerkAuth) jwkToPublicKey(jwk JWK) (*rsa.PublicKey, error) {
	if jwk.Kty != "RSA" {
		return nil, fmt.Errorf("unsupported key type: %s", jwk.Kty)
	}

	// Decode the modulus (n)
	nBytes, err := base64.RawURLEncoding.DecodeString(jwk.N)
	if err != nil {
		return nil, fmt.Errorf("failed to decode modulus: %w", err)
	}
	n := new(big.Int).SetBytes(nBytes)

	// Decode the exponent (e)
	eBytes, err := base64.RawURLEncoding.DecodeString(jwk.E)
	if err != nil {
		return nil, fmt.Errorf("failed to decode exponent: %w", err)
	}
	e := new(big.Int).SetBytes(eBytes)

	return &rsa.PublicKey{
		N: n,
		E: int(e.Int64()),
	}, nil
}

// getOrCreateOrganization looks up or creates an organization by Clerk org ID
func (ca *ClerkAuth) getOrCreateOrganization(clerkOrgID string) (*models.Organization, error) {
	var org models.Organization

	// Try to find existing organization
	result := database.DB.Where("clerk_org_id = ?", clerkOrgID).First(&org)
	if result.Error == nil {
		return &org, nil
	}

	// Create new organization
	org = models.Organization{
		ClerkOrgID:       clerkOrgID,
		Name:             "Organization " + clerkOrgID[:8], // Will be updated via Clerk webhook
		SubscriptionTier: "free",
		Status:           "active",
		MaxTenants:       5,
	}

	if err := database.DB.Create(&org).Error; err != nil {
		return nil, fmt.Errorf("failed to create organization: %w", err)
	}

	log.Printf("Created new organization: %s (Clerk ID: %s)", org.ID, clerkOrgID)
	return &org, nil
}

// GetOrgID extracts the organization ID from the request context
func GetOrgID(ctx context.Context) uuid.UUID {
	if orgID, ok := ctx.Value(OrgIDKey).(uuid.UUID); ok {
		return orgID
	}
	return uuid.Nil
}

// GetClerkOrgID extracts the Clerk organization ID from the request context
func GetClerkOrgID(ctx context.Context) string {
	if clerkOrgID, ok := ctx.Value(ClerkOrgIDKey).(string); ok {
		return clerkOrgID
	}
	return ""
}

// GetUserID extracts the user ID from the request context
func GetUserID(ctx context.Context) string {
	if userID, ok := ctx.Value(UserIDKey).(string); ok {
		return userID
	}
	return ""
}

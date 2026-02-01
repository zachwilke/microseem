package api

import (
	"crypto/rand"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/socr/o365-monitor/internal/database"
	"github.com/socr/o365-monitor/internal/middleware"
	"github.com/socr/o365-monitor/internal/models"
)

// RegisterAuthRoutes registers public auth routes (no auth required)
func RegisterAuthRoutes(r chi.Router) {
	r.Post("/auth/register", Register)
	r.Post("/auth/login", Login)
	r.Post("/auth/refresh", RefreshToken)
	r.Post("/auth/logout", Logout)
}

// RegisterUserRoutes registers authenticated user management routes
func RegisterUserRoutes(r chi.Router) {
	r.Get("/users/me", GetCurrentUser)
	r.Put("/users/me", UpdateCurrentUser)
	r.Put("/users/me/password", ChangePassword)

	// Admin-only routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAdmin)
		r.Get("/users", ListUsers)
		r.Post("/users", CreateUser)
		r.Get("/users/{id}", GetUser)
		r.Put("/users/{id}", UpdateUser)
		r.Delete("/users/{id}", DeleteUser)
	})
}

// RegisterRequest represents a new user registration
type RegisterRequest struct {
	Email            string `json:"email"`
	Password         string `json:"password"`
	FirstName        string `json:"first_name"`
	LastName         string `json:"last_name"`
	OrganizationName string `json:"organization_name"`
}

// LoginRequest represents login credentials
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthResponse contains tokens and user info
type AuthResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	ExpiresIn    int          `json:"expires_in"`
	User         UserResponse `json:"user"`
}

// UserResponse is a safe user representation (no password)
type UserResponse struct {
	ID             uuid.UUID   `json:"id"`
	Email          string      `json:"email"`
	FirstName      string      `json:"first_name"`
	LastName       string      `json:"last_name"`
	Role           models.Role `json:"role"`
	OrganizationID uuid.UUID   `json:"organization_id"`
	Organization   OrgResponse `json:"organization"`
	IsActive       bool        `json:"is_active"`
	CreatedAt      time.Time   `json:"created_at"`
}

type OrgResponse struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Slug string    `json:"slug"`
}

func toUserResponse(user *models.User) UserResponse {
	return UserResponse{
		ID:             user.ID,
		Email:          user.Email,
		FirstName:      user.FirstName,
		LastName:       user.LastName,
		Role:           user.Role,
		OrganizationID: user.OrganizationID,
		Organization: OrgResponse{
			ID:   user.Organization.ID,
			Name: user.Organization.Name,
			Slug: user.Organization.Slug,
		},
		IsActive:  user.IsActive,
		CreatedAt: user.CreatedAt,
	}
}

// Register creates a new user and organization
func Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate email
	if !isValidEmail(req.Email) {
		http.Error(w, `{"error": "invalid email address"}`, http.StatusBadRequest)
		return
	}

	// Validate password
	if len(req.Password) < 8 {
		http.Error(w, `{"error": "password must be at least 8 characters"}`, http.StatusBadRequest)
		return
	}

	// Check if user already exists
	var existingUser models.User
	if err := database.DB.Where("email = ?", strings.ToLower(req.Email)).First(&existingUser).Error; err == nil {
		http.Error(w, `{"error": "email already registered"}`, http.StatusConflict)
		return
	}

	// Hash password
	passwordHash, err := middleware.HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error": "failed to process password"}`, http.StatusInternalServerError)
		return
	}

	// Create organization
	orgSlug := generateSlug(req.OrganizationName)
	org := models.Organization{
		Name:             req.OrganizationName,
		Slug:             orgSlug,
		SubscriptionTier: "free",
		Status:           "active",
		MaxTenants:       5,
		MaxUsers:         10,
	}

	if err := database.DB.Create(&org).Error; err != nil {
		http.Error(w, `{"error": "failed to create organization"}`, http.StatusInternalServerError)
		return
	}

	// Create user as admin of the new org
	user := models.User{
		OrganizationID: org.ID,
		Email:          strings.ToLower(req.Email),
		PasswordHash:   passwordHash,
		FirstName:      req.FirstName,
		LastName:       req.LastName,
		Role:           models.RoleAdmin,
		IsActive:       true,
	}

	if err := database.DB.Create(&user).Error; err != nil {
		// Rollback org creation
		database.DB.Delete(&org)
		http.Error(w, `{"error": "failed to create user"}`, http.StatusInternalServerError)
		return
	}

	// Generate tokens
	accessToken, err := middleware.GenerateAccessToken(&user)
	if err != nil {
		http.Error(w, `{"error": "failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	refreshToken, err := middleware.GenerateRefreshToken()
	if err != nil {
		http.Error(w, `{"error": "failed to generate refresh token"}`, http.StatusInternalServerError)
		return
	}

	// Save session
	session := models.Session{
		UserID:       user.ID,
		RefreshToken: refreshToken,
		UserAgent:    r.UserAgent(),
		IPAddress:    getClientIP(r),
		ExpiresAt:    time.Now().Add(7 * 24 * time.Hour),
	}
	database.DB.Create(&session)

	// Load organization for response
	user.Organization = org

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    900, // 15 minutes in seconds
		User:         toUserResponse(&user),
	})
}

// Login authenticates a user
func Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Find user
	var user models.User
	if err := database.DB.Preload("Organization").Where("email = ?", strings.ToLower(req.Email)).First(&user).Error; err != nil {
		http.Error(w, `{"error": "invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	// Check if active
	if !user.IsActive {
		http.Error(w, `{"error": "account is disabled"}`, http.StatusForbidden)
		return
	}

	// Verify password
	if !middleware.CheckPassword(req.Password, user.PasswordHash) {
		http.Error(w, `{"error": "invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	// Generate tokens
	accessToken, err := middleware.GenerateAccessToken(&user)
	if err != nil {
		http.Error(w, `{"error": "failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	refreshToken, err := middleware.GenerateRefreshToken()
	if err != nil {
		http.Error(w, `{"error": "failed to generate refresh token"}`, http.StatusInternalServerError)
		return
	}

	// Save session
	session := models.Session{
		UserID:       user.ID,
		RefreshToken: refreshToken,
		UserAgent:    r.UserAgent(),
		IPAddress:    getClientIP(r),
		ExpiresAt:    time.Now().Add(7 * 24 * time.Hour),
	}
	database.DB.Create(&session)

	// Update last login
	now := time.Now()
	database.DB.Model(&user).Update("last_login_at", now)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    900,
		User:         toUserResponse(&user),
	})
}

// RefreshToken exchanges a refresh token for new tokens
func RefreshToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Find session
	var session models.Session
	if err := database.DB.Where("refresh_token = ?", req.RefreshToken).First(&session).Error; err != nil {
		http.Error(w, `{"error": "invalid refresh token"}`, http.StatusUnauthorized)
		return
	}

	// Check expiration
	if time.Now().After(session.ExpiresAt) {
		database.DB.Delete(&session)
		http.Error(w, `{"error": "refresh token expired"}`, http.StatusUnauthorized)
		return
	}

	// Get user
	var user models.User
	if err := database.DB.Preload("Organization").First(&user, session.UserID).Error; err != nil {
		http.Error(w, `{"error": "user not found"}`, http.StatusUnauthorized)
		return
	}

	if !user.IsActive {
		http.Error(w, `{"error": "account is disabled"}`, http.StatusForbidden)
		return
	}

	// Generate new tokens
	accessToken, err := middleware.GenerateAccessToken(&user)
	if err != nil {
		http.Error(w, `{"error": "failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	newRefreshToken, err := middleware.GenerateRefreshToken()
	if err != nil {
		http.Error(w, `{"error": "failed to generate refresh token"}`, http.StatusInternalServerError)
		return
	}

	// Update session with new refresh token
	session.RefreshToken = newRefreshToken
	session.ExpiresAt = time.Now().Add(7 * 24 * time.Hour)
	database.DB.Save(&session)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		ExpiresIn:    900,
		User:         toUserResponse(&user),
	})
}

// Logout invalidates a refresh token
func Logout(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	database.DB.Where("refresh_token = ?", req.RefreshToken).Delete(&models.Session{})
	w.WriteHeader(http.StatusOK)
}

// GetCurrentUser returns the current authenticated user
func GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var user models.User
	if err := database.DB.Preload("Organization").First(&user, userID).Error; err != nil {
		http.Error(w, `{"error": "user not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(toUserResponse(&user))
}

// UpdateCurrentUser updates the current user's profile
func UpdateCurrentUser(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var req struct {
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		http.Error(w, `{"error": "user not found"}`, http.StatusNotFound)
		return
	}

	user.FirstName = req.FirstName
	user.LastName = req.LastName
	database.DB.Save(&user)

	database.DB.Preload("Organization").First(&user, userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(toUserResponse(&user))
}

// ChangePassword changes the current user's password
func ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
		return
	}

	if len(req.NewPassword) < 8 {
		http.Error(w, `{"error": "new password must be at least 8 characters"}`, http.StatusBadRequest)
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		http.Error(w, `{"error": "user not found"}`, http.StatusNotFound)
		return
	}

	if !middleware.CheckPassword(req.CurrentPassword, user.PasswordHash) {
		http.Error(w, `{"error": "current password is incorrect"}`, http.StatusBadRequest)
		return
	}

	newHash, err := middleware.HashPassword(req.NewPassword)
	if err != nil {
		http.Error(w, `{"error": "failed to process password"}`, http.StatusInternalServerError)
		return
	}

	user.PasswordHash = newHash
	database.DB.Save(&user)

	// Invalidate all other sessions
	database.DB.Where("user_id = ?", userID).Delete(&models.Session{})

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "password changed successfully"}`))
}

// ListUsers returns all users in the organization (admin only)
func ListUsers(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	var users []models.User
	database.DB.Where("organization_id = ?", orgID).Order("created_at desc").Find(&users)

	var response []UserResponse
	for _, u := range users {
		response = append(response, UserResponse{
			ID:             u.ID,
			Email:          u.Email,
			FirstName:      u.FirstName,
			LastName:       u.LastName,
			Role:           u.Role,
			OrganizationID: u.OrganizationID,
			IsActive:       u.IsActive,
			CreatedAt:      u.CreatedAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// CreateUser creates a new user in the organization (admin only)
func CreateUser(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())

	var req struct {
		Email     string      `json:"email"`
		Password  string      `json:"password"`
		FirstName string      `json:"first_name"`
		LastName  string      `json:"last_name"`
		Role      models.Role `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
		return
	}

	if !isValidEmail(req.Email) {
		http.Error(w, `{"error": "invalid email address"}`, http.StatusBadRequest)
		return
	}

	if len(req.Password) < 8 {
		http.Error(w, `{"error": "password must be at least 8 characters"}`, http.StatusBadRequest)
		return
	}

	if !models.IsValidRole(req.Role) {
		req.Role = models.RoleTechnician
	}

	// Check if email exists
	var existing models.User
	if err := database.DB.Where("email = ?", strings.ToLower(req.Email)).First(&existing).Error; err == nil {
		http.Error(w, `{"error": "email already in use"}`, http.StatusConflict)
		return
	}

	passwordHash, err := middleware.HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error": "failed to process password"}`, http.StatusInternalServerError)
		return
	}

	user := models.User{
		OrganizationID: orgID,
		Email:          strings.ToLower(req.Email),
		PasswordHash:   passwordHash,
		FirstName:      req.FirstName,
		LastName:       req.LastName,
		Role:           req.Role,
		IsActive:       true,
	}

	if err := database.DB.Create(&user).Error; err != nil {
		http.Error(w, `{"error": "failed to create user"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(UserResponse{
		ID:             user.ID,
		Email:          user.Email,
		FirstName:      user.FirstName,
		LastName:       user.LastName,
		Role:           user.Role,
		OrganizationID: user.OrganizationID,
		IsActive:       user.IsActive,
		CreatedAt:      user.CreatedAt,
	})
}

// GetUser gets a user by ID (admin only)
func GetUser(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	userID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error": "invalid user ID"}`, http.StatusBadRequest)
		return
	}

	var user models.User
	if err := database.DB.Where("id = ? AND organization_id = ?", userID, orgID).First(&user).Error; err != nil {
		http.Error(w, `{"error": "user not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(UserResponse{
		ID:             user.ID,
		Email:          user.Email,
		FirstName:      user.FirstName,
		LastName:       user.LastName,
		Role:           user.Role,
		OrganizationID: user.OrganizationID,
		IsActive:       user.IsActive,
		CreatedAt:      user.CreatedAt,
	})
}

// UpdateUser updates a user (admin only)
func UpdateUser(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	currentUserID := middleware.GetUserID(r.Context())
	userID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error": "invalid user ID"}`, http.StatusBadRequest)
		return
	}

	var user models.User
	if err := database.DB.Where("id = ? AND organization_id = ?", userID, orgID).First(&user).Error; err != nil {
		http.Error(w, `{"error": "user not found"}`, http.StatusNotFound)
		return
	}

	var req struct {
		FirstName string      `json:"first_name"`
		LastName  string      `json:"last_name"`
		Role      models.Role `json:"role"`
		IsActive  *bool       `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Prevent admin from removing their own admin role
	if userID == currentUserID && req.Role != models.RoleAdmin {
		http.Error(w, `{"error": "cannot remove your own admin role"}`, http.StatusBadRequest)
		return
	}

	if req.FirstName != "" {
		user.FirstName = req.FirstName
	}
	if req.LastName != "" {
		user.LastName = req.LastName
	}
	if models.IsValidRole(req.Role) {
		user.Role = req.Role
	}
	if req.IsActive != nil {
		// Prevent admin from deactivating themselves
		if userID == currentUserID && !*req.IsActive {
			http.Error(w, `{"error": "cannot deactivate your own account"}`, http.StatusBadRequest)
			return
		}
		user.IsActive = *req.IsActive
	}

	database.DB.Save(&user)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(UserResponse{
		ID:             user.ID,
		Email:          user.Email,
		FirstName:      user.FirstName,
		LastName:       user.LastName,
		Role:           user.Role,
		OrganizationID: user.OrganizationID,
		IsActive:       user.IsActive,
		CreatedAt:      user.CreatedAt,
	})
}

// DeleteUser deletes a user (admin only)
func DeleteUser(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	currentUserID := middleware.GetUserID(r.Context())
	userID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error": "invalid user ID"}`, http.StatusBadRequest)
		return
	}

	// Prevent self-deletion
	if userID == currentUserID {
		http.Error(w, `{"error": "cannot delete your own account"}`, http.StatusBadRequest)
		return
	}

	result := database.DB.Where("id = ? AND organization_id = ?", userID, orgID).Delete(&models.User{})
	if result.RowsAffected == 0 {
		http.Error(w, `{"error": "user not found"}`, http.StatusNotFound)
		return
	}

	// Delete user's sessions
	database.DB.Where("user_id = ?", userID).Delete(&models.Session{})

	w.WriteHeader(http.StatusOK)
}

// Helper functions
func isValidEmail(email string) bool {
	re := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	return re.MatchString(email)
}

func generateSlug(name string) string {
	slug := strings.ToLower(name)
	slug = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "org"
	}
	// Add random suffix for uniqueness
	suffix := make([]byte, 4)
	rand.Read(suffix)
	return slug + "-" + strings.ToLower(string([]byte{
		'a' + suffix[0]%26,
		'a' + suffix[1]%26,
		'a' + suffix[2]%26,
		'a' + suffix[3]%26,
	}))
}

func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	return strings.Split(r.RemoteAddr, ":")[0]
}

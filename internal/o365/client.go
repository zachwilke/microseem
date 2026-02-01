package o365

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

const (
	AuthURL_Fmt = "https://login.microsoftonline.com/%s/oauth2/v2.0/token"
	ResourceAPI = "https://manage.office.com"
	Scope       = "https://manage.office.com/.default"
)

type Client struct {
	TenantID     string
	ClientID     string
	ClientSecret string
	HttpClient   *http.Client
}

type TokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
}

type ContentBlob struct {
	ContentType string `json:"contentType"`
	ContentId   string `json:"contentId"`
	ContentUri  string `json:"contentUri"`
	Created     string `json:"contentCreated"`
	Expiration  string `json:"contentExpiration"`
}

func NewClient(tenantID, clientID, clientSecret string) *Client {
	return &Client{
		TenantID:     tenantID,
		ClientID:     clientID,
		ClientSecret: clientSecret,
		HttpClient:   &http.Client{Timeout: 30 * time.Second},
	}
}

// GetAccessToken fetches a JWT from Azure AD
func (c *Client) GetAccessToken() (string, error) {
	apiURL := fmt.Sprintf(AuthURL_Fmt, c.TenantID)

	vals := url.Values{}
	vals.Set("client_id", c.ClientID)
	vals.Set("scope", Scope)
	vals.Set("client_secret", c.ClientSecret)
	vals.Set("grant_type", "client_credentials")

	resp, err := c.HttpClient.PostForm(apiURL, vals)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("failed to get token: %s %s", resp.Status, string(body))
	}

	var tokenResp TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", err
	}

	return tokenResp.AccessToken, nil
}

// ListAvailableContent gets the list of Available Content blobs for a content type (Audit.AzureActiveDirectory, Audit.Exchange, etc)
func (c *Client) ListAvailableContent(token string, contentType string, startTime, endTime time.Time) ([]ContentBlob, error) {
	// Format: YYYY-MM-DDTHH:MM:SS (API assumes UTC)
	startStr := startTime.UTC().Format("2006-01-02T15:04:05")
	endStr := endTime.UTC().Format("2006-01-02T15:04:05")

	reqURL := fmt.Sprintf("%s/api/v1.0/%s/activity/feed/subscriptions/content?contentType=%s&startTime=%s&endTime=%s",
		ResourceAPI, c.TenantID, contentType, startStr, endStr)

	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error: %s %s", resp.Status, string(body))
	}

	var blobs []ContentBlob
	if err := json.NewDecoder(resp.Body).Decode(&blobs); err != nil {
		return nil, err
	}

	return blobs, nil
}

// FetchContent retrieves the actual logs from a ContentUri
func (c *Client) FetchContent(token, contentUri string) ([]map[string]interface{}, error) {
	req, err := http.NewRequest("GET", contentUri, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Fetch error: %s", resp.Status)
	}

	// The response is a JSON array of event objects
	var events []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&events); err != nil {
		return nil, err
	}

	return events, nil
}

// StartSubscription enables the subscription for a specific content type
func (c *Client) StartSubscription(token, contentType string) error {
	reqURL := fmt.Sprintf("%s/api/v1.0/%s/activity/feed/subscriptions/start?contentType=%s",
		ResourceAPI, c.TenantID, contentType)

	req, err := http.NewRequest("POST", reqURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("StartSubscription error: %s %s", resp.Status, string(body))
	}

	return nil
}

// TestConnectionResult contains the result of a connection test
type TestConnectionResult struct {
	Success       bool     `json:"success"`
	Message       string   `json:"message"`
	Details       string   `json:"details,omitempty"`
	AuthOK        bool     `json:"auth_ok"`
	PermissionsOK bool     `json:"permissions_ok"`
	Subscriptions []string `json:"subscriptions,omitempty"`
}

// ListSubscriptions gets the current subscriptions
func (c *Client) ListSubscriptions(token string) ([]map[string]interface{}, error) {
	reqURL := fmt.Sprintf("%s/api/v1.0/%s/activity/feed/subscriptions/list",
		ResourceAPI, c.TenantID)

	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ListSubscriptions error: %s %s", resp.Status, string(body))
	}

	var subs []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&subs); err != nil {
		return nil, err
	}

	return subs, nil
}

// TestConnection verifies credentials and permissions
func (c *Client) TestConnection() TestConnectionResult {
	result := TestConnectionResult{
		Success:       false,
		AuthOK:        false,
		PermissionsOK: false,
	}

	// Step 1: Test authentication
	token, err := c.GetAccessToken()
	if err != nil {
		errStr := err.Error()
		result.Message = "Authentication failed"

		// Parse common errors
		if contains(errStr, "AADSTS700016") {
			result.Details = "Application not found. Verify the Client ID is correct and the app exists in this tenant."
		} else if contains(errStr, "AADSTS7000215") {
			result.Details = "Invalid client secret. The secret may have expired or been entered incorrectly."
		} else if contains(errStr, "AADSTS90002") {
			result.Details = "Tenant not found. Verify the Tenant ID is correct."
		} else if contains(errStr, "AADSTS700027") {
			result.Details = "Client assertion failed. Check that the client secret is valid."
		} else if contains(errStr, "AADSTS50126") {
			result.Details = "Invalid credentials. Check your Client ID and Client Secret."
		} else {
			result.Details = errStr
		}
		return result
	}

	result.AuthOK = true

	// Step 2: Test API permissions by listing subscriptions
	subs, err := c.ListSubscriptions(token)
	if err != nil {
		errStr := err.Error()
		result.Message = "API permission check failed"

		if contains(errStr, "403") || contains(errStr, "Forbidden") {
			result.Details = "Access denied. The app lacks required permissions. Ensure 'Office 365 Management APIs > ActivityFeed.Read' (Application) is granted and admin consent is approved."
		} else if contains(errStr, "401") || contains(errStr, "Unauthorized") {
			result.Details = "Unauthorized. The token may not have the required scopes. Check API permissions and admin consent."
		} else if contains(errStr, "AF20024") {
			result.Details = "Subscription not started. This is normal for first-time setup - subscriptions will be created automatically."
			result.PermissionsOK = true
			result.Success = true
			result.Message = "Connection successful"
		} else {
			result.Details = errStr
		}

		// If we got an auth error but could authenticate, permissions are likely the issue
		if result.AuthOK && !result.PermissionsOK {
			return result
		}
	}

	result.PermissionsOK = true
	result.Success = true
	result.Message = "Connection successful"

	// Collect active subscriptions
	var activeTypes []string
	for _, sub := range subs {
		if status, ok := sub["status"].(string); ok && status == "enabled" {
			if ct, ok := sub["contentType"].(string); ok {
				activeTypes = append(activeTypes, ct)
			}
		}
	}
	result.Subscriptions = activeTypes

	if len(activeTypes) > 0 {
		result.Details = fmt.Sprintf("Found %d active subscription(s)", len(activeTypes))
	} else {
		result.Details = "Authentication and permissions verified. Subscriptions will be created when polling starts."
	}

	return result
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsImpl(s, substr))
}

func containsImpl(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

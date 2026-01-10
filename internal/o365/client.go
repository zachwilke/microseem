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
	// Format: YYYY-MM-DDTHH:MM:SS
	startStr := startTime.Format("2006-01-02T15:04:05")
	endStr := endTime.Format("2006-01-02T15:04:05")

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

package elasticsearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// SearchLogs searches for logs in Elasticsearch
func SearchLogs(ctx context.Context, params SearchParams) (*SearchResult, error) {
	if Client == nil {
		return nil, fmt.Errorf("elasticsearch client not initialized")
	}

	// Validate and bound the size parameter
	params.Size = ValidateSize(params.Size)

	indexPattern := GetIndexPattern(params.OrgID)

	// Build the query
	query := buildSearchQuery(params)

	queryBytes, _ := json.Marshal(query)

	res, err := Client.Search(
		Client.Search.WithContext(ctx),
		Client.Search.WithIndex(indexPattern),
		Client.Search.WithBody(bytes.NewReader(queryBytes)),
		Client.Search.WithTrackTotalHits(true),
		Client.Search.WithSize(params.Size),
		Client.Search.WithFrom(params.From),
		Client.Search.WithSort("creation_time:desc"),
	)
	if err != nil {
		return nil, fmt.Errorf("search failed: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		return nil, fmt.Errorf("search error: %s", res.String())
	}

	var response struct {
		Hits struct {
			Total struct {
				Value int64 `json:"value"`
			} `json:"total"`
			Hits []struct {
				Source LogDocument `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}

	if err := json.NewDecoder(res.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	result := &SearchResult{
		Total: response.Hits.Total.Value,
		Logs:  make([]LogDocument, 0, len(response.Hits.Hits)),
	}

	for _, hit := range response.Hits.Hits {
		result.Logs = append(result.Logs, hit.Source)
	}

	return result, nil
}

// buildSearchQuery builds the Elasticsearch query
func buildSearchQuery(params SearchParams) map[string]interface{} {
	must := []interface{}{}
	filter := []interface{}{}

	// Always filter by organization
	filter = append(filter, map[string]interface{}{
		"term": map[string]interface{}{
			"organization_id": params.OrgID.String(),
		},
	})

	// Time range filter
	if params.StartTime != nil || params.EndTime != nil {
		rangeFilter := map[string]interface{}{}
		if params.StartTime != nil {
			rangeFilter["gte"] = params.StartTime.Format(time.RFC3339)
		}
		if params.EndTime != nil {
			rangeFilter["lte"] = params.EndTime.Format(time.RFC3339)
		}
		filter = append(filter, map[string]interface{}{
			"range": map[string]interface{}{
				"creation_time": rangeFilter,
			},
		})
	}

	// Tenant filter
	if params.TenantID != nil {
		filter = append(filter, map[string]interface{}{
			"term": map[string]interface{}{
				"tenant_id": params.TenantID.String(),
			},
		})
	}

	// Full-text search
	if params.Query != "" {
		if params.Fuzzy {
			must = append(must, map[string]interface{}{
				"multi_match": map[string]interface{}{
					"query":     params.Query,
					"fields":    []string{"operation", "user_id", "workload", "city", "country_code"},
					"fuzziness": "AUTO",
				},
			})
		} else {
			must = append(must, map[string]interface{}{
				"multi_match": map[string]interface{}{
					"query":  params.Query,
					"fields": []string{"operation", "user_id", "workload", "city", "country_code"},
				},
			})
		}
	}

	// Field filters
	for _, f := range params.Filters {
		switch f.Operator {
		case "=":
			filter = append(filter, map[string]interface{}{
				"term": map[string]interface{}{
					mapFieldName(f.Field): f.Value,
				},
			})
		case "!=":
			filter = append(filter, map[string]interface{}{
				"bool": map[string]interface{}{
					"must_not": map[string]interface{}{
						"term": map[string]interface{}{
							mapFieldName(f.Field): f.Value,
						},
					},
				},
			})
		case "contains":
			must = append(must, map[string]interface{}{
				"wildcard": map[string]interface{}{
					mapFieldName(f.Field): map[string]interface{}{
						"value":            "*" + f.Value + "*",
						"case_insensitive": true,
					},
				},
			})
		}
	}

	query := map[string]interface{}{
		"query": map[string]interface{}{
			"bool": map[string]interface{}{
				"must":   must,
				"filter": filter,
			},
		},
	}

	return query
}

// mapFieldName maps API field names to ES field names
func mapFieldName(field string) string {
	switch field {
	case "user_id", "userId":
		return "user_id"
	case "client_ip", "clientIp":
		return "client_ip"
	case "country_code", "countryCode":
		return "country_code"
	default:
		return field
	}
}

// GetStats retrieves statistics for an organization
func GetStats(ctx context.Context, orgID uuid.UUID, tenantID *uuid.UUID) (*StatsResult, error) {
	if Client == nil {
		return nil, fmt.Errorf("elasticsearch client not initialized")
	}

	indexPattern := GetIndexPattern(orgID)

	// Build aggregation query
	filter := []interface{}{
		map[string]interface{}{
			"term": map[string]interface{}{
				"organization_id": orgID.String(),
			},
		},
		map[string]interface{}{
			"range": map[string]interface{}{
				"creation_time": map[string]interface{}{
					"gte": "now-24h",
				},
			},
		},
	}

	if tenantID != nil {
		filter = append(filter, map[string]interface{}{
			"term": map[string]interface{}{
				"tenant_id": tenantID.String(),
			},
		})
	}

	query := map[string]interface{}{
		"size": 0,
		"query": map[string]interface{}{
			"bool": map[string]interface{}{
				"filter": filter,
			},
		},
		"aggs": map[string]interface{}{
			"top_users": map[string]interface{}{
				"terms": map[string]interface{}{
					"field": "user_id",
					"size":  5,
				},
			},
			"top_operations": map[string]interface{}{
				"terms": map[string]interface{}{
					"field": "operation",
					"size":  5,
				},
			},
			"volume_history": map[string]interface{}{
				"date_histogram": map[string]interface{}{
					"field":          "creation_time",
					"fixed_interval": "1h",
				},
			},
		},
	}

	queryBytes, _ := json.Marshal(query)

	res, err := Client.Search(
		Client.Search.WithContext(ctx),
		Client.Search.WithIndex(indexPattern),
		Client.Search.WithBody(bytes.NewReader(queryBytes)),
		Client.Search.WithTrackTotalHits(true),
	)
	if err != nil {
		return nil, fmt.Errorf("stats query failed: %w", err)
	}
	defer res.Body.Close()

	if res.IsError() {
		return nil, fmt.Errorf("stats query error: %s", res.String())
	}

	var response struct {
		Hits struct {
			Total struct {
				Value int64 `json:"value"`
			} `json:"total"`
		} `json:"hits"`
		Aggregations struct {
			TopUsers struct {
				Buckets []struct {
					Key      string `json:"key"`
					DocCount int64  `json:"doc_count"`
				} `json:"buckets"`
			} `json:"top_users"`
			TopOperations struct {
				Buckets []struct {
					Key      string `json:"key"`
					DocCount int64  `json:"doc_count"`
				} `json:"buckets"`
			} `json:"top_operations"`
			VolumeHistory struct {
				Buckets []struct {
					KeyAsString string `json:"key_as_string"`
					Key         int64  `json:"key"`
					DocCount    int64  `json:"doc_count"`
				} `json:"buckets"`
			} `json:"volume_history"`
		} `json:"aggregations"`
	}

	if err := json.NewDecoder(res.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	result := &StatsResult{
		TotalLogs:     response.Hits.Total.Value,
		TopUsers:      make([]BucketResult, 0),
		TopOperations: make([]BucketResult, 0),
		VolumeHistory: make([]VolumeDataPoint, 0),
	}

	for _, b := range response.Aggregations.TopUsers.Buckets {
		result.TopUsers = append(result.TopUsers, BucketResult{
			Key:   b.Key,
			Count: b.DocCount,
		})
	}

	for _, b := range response.Aggregations.TopOperations.Buckets {
		result.TopOperations = append(result.TopOperations, BucketResult{
			Key:   b.Key,
			Count: b.DocCount,
		})
	}

	for _, b := range response.Aggregations.VolumeHistory.Buckets {
		result.VolumeHistory = append(result.VolumeHistory, VolumeDataPoint{
			Time:  time.UnixMilli(b.Key),
			Count: b.DocCount,
		})
	}

	return result, nil
}

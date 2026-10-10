package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

const (
	geminiBaseURL = "https://generativelanguage.googleapis.com/v1beta/models/"
	EmbeddingDims = 768
)

// ---- Gemini request / response types (named, so they're reusable) ----

type Part struct {
	Text string `json:"text"`
}

type Content struct {
	Role  string `json:"role,omitempty"`
	Parts []Part `json:"parts"`
}

type GeminiChatRequest struct {
	SystemInstruction *Content         `json:"system_instruction,omitempty"`
	Contents          []Content        `json:"contents"`
	GenerationConfig  *GenerationConfig `json:"generationConfig,omitempty"`
}

type GenerationConfig struct {
	Temperature float32 `json:"temperature"`
}

type GeminiChatResponse struct {
	Candidates []struct {
		Content Content `json:"content"`
	} `json:"candidates"`
	Error *GeminiError `json:"error,omitempty"`
}

type GeminiEmbedRequest struct {
	Content              Content `json:"content"`
	TaskType             string  `json:"taskType,omitempty"`
	OutputDimensionality int     `json:"outputDimensionality,omitempty"`
}

type GeminiEmbedResponse struct {
	Embedding struct {
		Values []float32 `json:"values"`
	} `json:"embedding"`
	Error *GeminiError `json:"error,omitempty"`
}

type GeminiError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// ---- Client ----

type GeminiClient struct {
	apiKey     string
	chatModel  string
	embedModel string
	http       *http.Client
}

func NewGeminiClient(apiKey string) *GeminiClient {
	return &GeminiClient{
		apiKey:     apiKey,
		chatModel:  envOr("GEMINI_MODEL", "gemini-3.8-flash"),
		embedModel: envOr("GEMINI_EMBED_MODEL", "gemini-embedding-001"),
		http:       &http.Client{Timeout: 60 * time.Second},
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func (g *GeminiClient) post(ctx context.Context, model, method string, in, out any) error {
	body, err := json.Marshal(in)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		geminiBaseURL+model+":"+method, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", g.apiKey) // keeps the key out of URLs / logs

	resp, err := g.http.Do(req)
	if err != nil {
		return fmt.Errorf("gemini request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("gemini %s returned %d: %s", method, resp.StatusCode, truncate(string(raw), 300))
	}
	return json.Unmarshal(raw, out)
}

// Embed turns text into a 768-dim vector. taskType: RETRIEVAL_DOCUMENT or RETRIEVAL_QUERY.
func (g *GeminiClient) Embed(ctx context.Context, text, taskType string) ([]float32, error) {
	var res GeminiEmbedResponse
	err := g.post(ctx, g.embedModel, "embedContent", GeminiEmbedRequest{
		Content:              Content{Parts: []Part{{Text: text}}},
		TaskType:             taskType,
		OutputDimensionality: EmbeddingDims,
	}, &res)
	if err != nil {
		return nil, err
	}
	if len(res.Embedding.Values) != EmbeddingDims {
		return nil, fmt.Errorf("unexpected embedding size %d", len(res.Embedding.Values))
	}
	return res.Embedding.Values, nil
}

// Generate asks the chat model a question with a system persona.
func (g *GeminiClient) Generate(ctx context.Context, system, prompt string) (string, error) {
	var res GeminiChatResponse
	err := g.post(ctx, g.chatModel, "generateContent", GeminiChatRequest{
		SystemInstruction: &Content{Parts: []Part{{Text: system}}},
		Contents:          []Content{{Role: "user", Parts: []Part{{Text: prompt}}}},
		GenerationConfig:  &GenerationConfig{Temperature: 0.4},
	}, &res)
	if err != nil {
		return "", err
	}
	if len(res.Candidates) == 0 || len(res.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("gemini returned no candidates")
	}
	var out string
	for _, p := range res.Candidates[0].Content.Parts {
		out += p.Text
	}
	return out, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}


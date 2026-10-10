package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

const (
	maxUploadBytes = 2 << 20 // 2 MB
	chunkSize      = 1200
	topK           = 5
	agentPersona   = `You are AGENT K-8, a field analyst at the 1980s Retro Intelligence Bureau.
Answer the user's query based ONLY on the provided CASE FILES.
If the files do not contain the answer, reply exactly with a short line stating the information is "NOT IN THE ARCHIVES".
Use a sharp, clinical, retro dossier tone. Keep it under 180 words.
Cite the case file title in [brackets] for each fact you use.`
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// POST /api/v1/upload
// Accepts either multipart/form-data (field "file", optional "title")
// or JSON {"title": "...", "content": "..."}.
func (s *Server) handleUploadCaseFile(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)

	var title, content string
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
			writeErr(w, http.StatusBadRequest, "file too large or malformed form (max 2MB)")
			return
		}
		file, hdr, err := r.FormFile("file")
		if err != nil {
			writeErr(w, http.StatusBadRequest, `missing "file" field`)
			return
		}
		defer file.Close()
		raw, err := io.ReadAll(file)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "could not read file")
			return
		}
		content = string(raw)
		title = r.FormValue("title")
		if title == "" {
			title = strings.TrimSuffix(hdr.Filename, filepath.Ext(hdr.Filename))
		}
	} else {
		var body struct {
			Title   string `json:"title"`
			Content string `json:"content"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		title, content = body.Title, body.Content
	}

	title = strings.TrimSpace(title)
	if title == "" {
		title = "UNTITLED DOSSIER"
	}
	chunks := chunkText(content, chunkSize)
	if len(chunks) == 0 {
		writeErr(w, http.StatusBadRequest, "case file is empty")
		return
	}

	vecs := make([][]float32, len(chunks))
	for i, c := range chunks {
		v, err := s.AI.Embed(r.Context(), "Case file: "+title+"\n\n"+c, "RETRIEVAL_DOCUMENT")
		if err != nil {
			log.Printf("embed error: %v", err)
			writeErr(w, http.StatusBadGateway, "embedding service failure")
			return
		}
		vecs[i] = v
	}

	id, err := s.insertCaseFile(r.Context(), title, chunks, vecs)
	if err != nil {
		log.Printf("db insert error: %v", err)
		writeErr(w, http.StatusInternalServerError, "could not archive case file")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":     id,
		"title":  title,
		"chunks": len(chunks),
		"status": "ARCHIVED",
	})
}

// POST /api/v1/investigate  {"question": "..."}
func (s *Server) handleAgentInvestigation(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Question string `json:"question"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	userQuestion := strings.TrimSpace(body.Question)
	if userQuestion == "" {
		writeErr(w, http.StatusBadRequest, "question is required")
		return
	}

	// 1. Embed the question.
	qVec, err := s.AI.Embed(r.Context(), userQuestion, "RETRIEVAL_QUERY")
	if err != nil {
		log.Printf("embed error: %v", err)
		writeErr(w, http.StatusBadGateway, "agent network failure")
		return
	}

	// 2. Pull the most relevant evidence from the archive.
	evidence, err := s.searchEvidence(r.Context(), qVec, topK)
	if err != nil {
		log.Printf("search error: %v", err)
		writeErr(w, http.StatusInternalServerError, "archive search failure")
		return
	}
	if len(evidence) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{
			"agent_report": "ARCHIVES EMPTY. Upload a case file before requesting an investigation.",
			"evidence":     []Evidence{},
		})
		return
	}

	// 3. Build the context and ask the agent.
	var sb strings.Builder
	for i, e := range evidence {
		fmt.Fprintf(&sb, "--- EXHIBIT %d [%s] ---\n%s\n\n", i+1, e.CaseTitle, e.Content)
	}
	contextData := sb.String()
	fullPrompt := "CASE FILES:\n" + contextData + "\nQUERY: " + userQuestion

	agentReport, err := s.AI.Generate(r.Context(), agentPersona, fullPrompt)
	if err != nil {
		log.Printf("generate error: %v", err)
		writeErr(w, http.StatusBadGateway, "agent network failure")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"agent_report": agentReport,
		"evidence":     evidence,
	})
}

// GET /api/v1/cases
func (s *Server) handleListCaseFiles(w http.ResponseWriter, r *http.Request) {
	cases, err := s.listCaseFiles(r.Context())
	if err != nil {
		log.Printf("list error: %v", err)
		writeErr(w, http.StatusInternalServerError, "could not read archive")
		return
	}
	writeJSON(w, http.StatusOK, cases)
}

// DELETE /api/v1/cases/{id}
func (s *Server) handleDeleteCaseFile(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	tag, err := s.DB.Exec(r.Context(), `DELETE FROM case_files WHERE id = $1`, id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not shred file")
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, http.StatusNotFound, "case file not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "SHREDDED"})
}

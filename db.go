package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
)

func migrate(ctx context.Context, db *pgxpool.Pool) error {
	stmts := []string{
		`CREATE EXTENSION IF NOT EXISTS vector`,
		`CREATE TABLE IF NOT EXISTS case_files (
			id         BIGSERIAL PRIMARY KEY,
			title      TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS case_chunks (
			id           BIGSERIAL PRIMARY KEY,
			case_file_id BIGINT NOT NULL REFERENCES case_files(id) ON DELETE CASCADE,
			chunk_index  INT NOT NULL,
			content      TEXT NOT NULL,
			embedding    vector(%d) NOT NULL
		)`, EmbeddingDims),
		`CREATE INDEX IF NOT EXISTS case_chunks_embedding_idx
			ON case_chunks USING hnsw (embedding vector_cosine_ops)`,
	}
	for _, q := range stmts {
		if _, err := db.Exec(ctx, q); err != nil {
			return fmt.Errorf("%w (while running: %s)", err, strings.SplitN(q, "\n", 2)[0])
		}
	}
	return nil
}

type CaseFile struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	Chunks    int       `json:"chunks"`
	CreatedAt time.Time `json:"created_at"`
}

type Evidence struct {
	CaseTitle string  `json:"case_title"`
	Content   string  `json:"content"`
	Score     float64 `json:"score"` // cosine similarity, 1 = identical
}

func (s *Server) insertCaseFile(ctx context.Context, title string, chunks []string, vecs [][]float32) (int64, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var id int64
	if err := tx.QueryRow(ctx,
		`INSERT INTO case_files (title) VALUES ($1) RETURNING id`, title).Scan(&id); err != nil {
		return 0, err
	}
	for i, c := range chunks {
		if _, err := tx.Exec(ctx,
			`INSERT INTO case_chunks (case_file_id, chunk_index, content, embedding) VALUES ($1,$2,$3,$4)`,
			id, i, c, pgvector.NewVector(vecs[i])); err != nil {
			return 0, err
		}
	}
	return id, tx.Commit(ctx)
}

func (s *Server) searchEvidence(ctx context.Context, q []float32, limit int) ([]Evidence, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT f.title, c.content, 1 - (c.embedding <=> $1) AS score
		FROM case_chunks c
		JOIN case_files f ON f.id = c.case_file_id
		ORDER BY c.embedding <=> $1
		LIMIT $2`, pgvector.NewVector(q), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Evidence
	for rows.Next() {
		var e Evidence
		if err := rows.Scan(&e.CaseTitle, &e.Content, &e.Score); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Server) listCaseFiles(ctx context.Context) ([]CaseFile, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT f.id, f.title, f.created_at, COUNT(c.id)
		FROM case_files f
		LEFT JOIN case_chunks c ON c.case_file_id = f.id
		GROUP BY f.id
		ORDER BY f.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []CaseFile{}
	for rows.Next() {
		var c CaseFile
		if err := rows.Scan(&c.ID, &c.Title, &c.CreatedAt, &c.Chunks); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// chunkText splits text on paragraph boundaries into ~maxLen-rune pieces.
func chunkText(text string, maxLen int) []string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	var chunks []string
	var cur strings.Builder

	flush := func() {
		if t := strings.TrimSpace(cur.String()); t != "" {
			chunks = append(chunks, t)
		}
		cur.Reset()
	}

	for _, para := range strings.Split(text, "\n\n") {
		para = strings.TrimSpace(para)
		if para == "" {
			continue
		}
		// Hard-split oversized paragraphs.
		for r := []rune(para); len(r) > 0; {
			n := min(len(r), maxLen)
			piece := string(r[:n])
			r = r[n:]
			if len([]rune(cur.String()))+len([]rune(piece)) > maxLen {
				flush()
			}
			if cur.Len() > 0 {
				cur.WriteString("\n\n")
			}
			cur.WriteString(piece)
		}
	}
	flush()
	return chunks
}

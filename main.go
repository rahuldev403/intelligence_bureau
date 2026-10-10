package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	pgxvec "github.com/pgvector/pgvector-go/pgx"
)

//go:embed web
var webFS embed.FS

type Server struct {
	Router *chi.Mux
	DB     *pgxpool.Pool
	AI     *GeminiClient
}

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set (see .env.example)")
	}
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		log.Fatal("GEMINI_API_KEY is not set (see .env.example)")
	}

	dbpool := setupDatabase(dbURL)
	defer dbpool.Close()

	if err := migrate(context.Background(), dbpool); err != nil {
		log.Fatalf("Database migration failed: %v", err)
	}

	s := &Server{
		Router: chi.NewRouter(),
		DB:     dbpool,
		AI:     NewGeminiClient(apiKey),
	}

	// FIX: middleware.Logger is already a middleware func — it must not be called.
	s.Router.Use(middleware.Logger)
	s.Router.Use(middleware.Recoverer)
	s.Router.Use(middleware.Timeout(90 * time.Second))
	s.Router.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"http://localhost:3000", "http://localhost:8080"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type"},
	}))

	s.setupRoutes()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	fmt.Printf("Retro Intelligence Bureau online -> http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, s.Router))
}

func setupDatabase(dbURL string) *pgxpool.Pool {
	ctx := context.Background()
	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		log.Fatalf("Unable to parse database URL: %v\n", err)
	}

	config.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		return pgxvec.RegisterTypes(ctx, conn)
	}

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		log.Fatalf("Unable to create connection pool: %v\n", err)
	}
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("Unable to reach database: %v\n", err)
	}
	return pool
}

func (s *Server) setupRoutes() {
	s.Router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("System Online"))
	})

	s.Router.Route("/api/v1", func(r chi.Router) {
		r.Get("/cases", s.handleListCaseFiles)
		r.Delete("/cases/{id}", s.handleDeleteCaseFile)
		r.Post("/upload", s.handleUploadCaseFile)
		r.Post("/investigate", s.handleAgentInvestigation)
	})

	// Retro pixel frontend (embedded into the binary).
	static, err := fs.Sub(webFS, "web")
	if err != nil {
		log.Fatal(err)
	}
	s.Router.Handle("/*", http.FileServer(http.FS(static)))
}

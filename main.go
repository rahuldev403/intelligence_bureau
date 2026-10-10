package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	pgxvec "github.com/pgvector/pgvector-go/pgx"
)

type Server struct {
	Router *chi.Mux
	DB     *pgxpool.Pool
}

func main() {
	godotenv.Load()

	dbpool := setupDatabase(os.Getenv("DATABASE_URL"))

	defer dbpool.Close()

	s := &Server{
		Router: chi.NewRouter(),
		DB:     dbpool,
	}

	s.Router.Use(middleware.Logger())
	s.Router.Use(middleware.Recover)
	s.Router.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"http://localhost:3000"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type"},
	}))

	s.setupRoutes()
	fmt.Println("Retro Intelligence Bureau API running on port 8080...")
	log.Fatal(http.ListenAndServe(":8080", s.Router))
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
	return pool
}

func (s *Server) setupRoutes() {
	s.Router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("System Online"))
	})

	s.Router.Route("/api/v1", func(r chi.Router) {
		r.Post("/upload", s.handleUploadCaseFile)
		r.Post("/investigate", s.handleAgentInvestigation)
	})
}

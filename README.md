# 🕵️ Retro Intelligence Bureau

A 1980s-themed **RAG (retrieval-augmented generation) agent**. You feed it case files, it splits them into chunks, embeds them with Gemini and stores them in Postgres + pgvector. Then you ask questions and **Agent K-8** answers using only the evidence, citing the case file each fact came from.

**Stack:** Go · chi · pgx · pgvector · Gemini API · Next.js (App Router)

```
frontend (Next.js :3000)  ──►  Go API (:8080)  ──►  Postgres + pgvector
                                     │
                                     └──►  Gemini (embeddings + chat)
```

## Run it

```bash
# 1. Database (Postgres with the pgvector extension)
docker compose up -d

# 2. API
cp .env.example .env        # add your GEMINI_API_KEY
go run .

# 3. Frontend
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                 # http://localhost:3000
```

On startup the API creates the tables automatically.

## API

| Method | Path | Body |
|---|---|---|
| GET | `/health` | – |
| GET | `/api/v1/cases` | – |
| POST | `/api/v1/upload` | multipart `file` (+ `title`) **or** JSON `{title, content}` |
| POST | `/api/v1/investigate` | JSON `{question}` → `{agent_report, evidence[]}` |
| DELETE | `/api/v1/cases/{id}` | – |

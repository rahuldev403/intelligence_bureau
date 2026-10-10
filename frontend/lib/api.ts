export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export type CaseFile = {
  id: number;
  title: string;
  chunks: number;
  created_at: string;
};

export type Evidence = {
  case_title: string;
  content: string;
  score: number;
};

export type Investigation = {
  agent_report: string;
  evidence: Evidence[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  health: async () => {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    return res.ok;
  },
  listCases: () => request<CaseFile[]>("/api/v1/cases", { cache: "no-store" }),
  deleteCase: (id: number) => request<{ status: string }>(`/api/v1/cases/${id}`, { method: "DELETE" }),
  uploadFile: (form: FormData) =>
    request<{ id: number; title: string; chunks: number }>("/api/v1/upload", { method: "POST", body: form }),
  uploadText: (title: string, content: string) =>
    request<{ id: number; title: string; chunks: number }>("/api/v1/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    }),
  investigate: (question: string) =>
    request<Investigation>("/api/v1/investigate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }),
};


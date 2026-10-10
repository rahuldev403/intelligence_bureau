"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type CaseFile, type Evidence } from "@/lib/api";
import MediaSlot from "./MediaSlot";

/* ---------------- typewriter ---------------- */
function useTypewriter(text: string, speed = 12) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!text) { setOut(""); return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let i = 0;
    const id = setInterval(() => {
      i = reduce ? text.length : i + 2;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return text ? out : "";
}

/* ---------------- status LED ---------------- */
function StatusLed() {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    const check = () => api.health().then(setOnline).catch(() => setOnline(false));
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);
  const label = online === null ? "CONNECTING..." : online ? "UPLINK ONLINE" : "UPLINK OFFLINE";
  return (
    <div className={`status-led ${online ? "on" : online === false ? "off" : ""}`} role="status">
      <span className="led" aria-hidden="true" />
      {label}
    </div>
  );
}

/* ---------------- evidence modal ---------------- */
function EvidenceModal({
  evidence,
  dialogRef,
}: {
  evidence: Evidence[];
  dialogRef: React.RefObject<HTMLDialogElement | null>;
}) {
  function close() { dialogRef.current?.close(); }

  // Close on backdrop click
  function onDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) return;
    const outside =
      e.clientX < rect.left || e.clientX > rect.right ||
      e.clientY < rect.top  || e.clientY > rect.bottom;
    if (outside) close();
  }

  return (
    <dialog ref={dialogRef} className="evidence-modal" onClick={onDialogClick} aria-label="Evidence exhibits">
      <div className="evidence-modal-inner">
        <div className="evidence-modal-header">
          <h3>EVIDENCE EXHIBITS — {evidence.length} ITEMS</h3>
          <button className="btn btn-sm btn-red" onClick={close} aria-label="Close">✕ CLOSE</button>
        </div>
        <ol className="evidence-list">
          {evidence.map((ev, i) => (
            <li key={i} className="evidence-item">
              <header>
                <strong>[{ev.case_title}]</strong>
                <span className="score">MATCH {(ev.score * 100).toFixed(0)}%</span>
              </header>
              <p>{ev.content}</p>
            </li>
          ))}
        </ol>
      </div>
    </dialog>
  );
}

/* ---------------- past answers history ---------------- */
type HistoryEntry = {
  id: number;
  question: string;
  report: string;
  evidence: Evidence[];
  timestamp: string;
};

function HistoryPanel({
  entries,
  onViewEvidence,
}: {
  entries: HistoryEntry[];
  onViewEvidence: (ev: Evidence[]) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="history-panel">
      <h3 className="history-title">▶ PAST TRANSMISSIONS — {entries.length}</h3>
      <ul className="history-list">
        {entries.map((entry) => (
          <li key={entry.id} className="history-entry pixel-box">
            <div className="history-meta">
              <span className="history-q">&gt; {entry.question}</span>
              <span className="history-time dim">{entry.timestamp}</span>
            </div>
            <p className="history-report">{entry.report}</p>
            {entry.evidence.length > 0 && (
              <button
                className="btn btn-sm btn-amber"
                onClick={() => onViewEvidence(entry.evidence)}
              >
                VIEW {entry.evidence.length} EXHIBITS
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- upload ---------------- */
function UploadPanel({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const content = String(data.get("content") ?? "").trim();

    if (!file && !content) {
      setMsg({ ok: false, text: "✖ NO INTEL PROVIDED. ATTACH A FILE OR PASTE TEXT." });
      return;
    }
    setBusy(true);
    setMsg({ ok: true, text: "▒▒▒ SHREDDING & VECTORIZING..." });
    try {
      const res = file
        ? await api.uploadFile((() => {
            const f = new FormData();
            f.append("file", file);
            if (title) f.append("title", title);
            return f;
          })())
        : await api.uploadText(title, content);
      setMsg({ ok: true, text: `✔ "${res.title}" ARCHIVED (${res.chunks} CHUNKS)` });
      form.reset();
      setFile(null);
      onUploaded();
    } catch (err) {
      setMsg({ ok: false, text: `✖ ${(err as Error).message.toUpperCase()}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pixel-box" aria-labelledby="upload-h">
      <h2 id="upload-h">▶ FILE A CASE</h2>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="title">Case title</label>
          <input id="title" name="title" type="text" maxLength={120} placeholder="OPERATION NIGHTOWL" autoComplete="off" />
        </div>

        <div className="field">
          <label
            htmlFor="file"
            className={`dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
          >
            <span className="drop-icon" aria-hidden="true">📁</span>
            <span>{file ? `LOADED: ${file.name}` : "DROP .TXT / .MD FILE OR CLICK"}</span>
          </label>
          <input
            ref={fileRef}
            id="file"
            name="file"
            type="file"
            accept=".txt,.md,.csv,.json,text/*"
            className="visually-hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <p className="or">— OR PASTE INTEL —</p>

        <div className="field">
          <label htmlFor="content">Raw intel</label>
          <textarea id="content" name="content" rows={6} placeholder="Subject was seen at Pier 9 at 0300 hours..." />
        </div>

        <button type="submit" className="btn" disabled={busy}>
          {busy ? "ARCHIVING..." : "ARCHIVE FILE"}
        </button>
        <p className={`msg ${msg?.ok === false ? "err" : ""}`} aria-live="polite">{msg?.text}</p>
      </form>
    </section>
  );
}

/* ---------------- investigate ---------------- */
let historyCounter = 0;

function InvestigatePanel() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [modalEvidence, setModalEvidence] = useState<Evidence[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const typed = useTypewriter(report);

  function openModal(ev: Evidence[]) {
    setModalEvidence(ev);
    dialogRef.current?.showModal();
  }

  function clearCurrent() {
    setReport("");
    setError("");
    setEvidence([]);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const q = String(new FormData(form).get("question") ?? "").trim();
    if (!q) return;
    setBusy(true);
    setError("");
    setReport("");
    setEvidence([]);
    try {
      const res = await api.investigate(q);
      setReport(res.agent_report);
      setEvidence(res.evidence ?? []);
      // Prepend to history
      setHistory((prev) => [{
        id: ++historyCounter,
        question: q,
        report: res.agent_report,
        evidence: res.evidence ?? [],
        timestamp: new Date().toLocaleTimeString(),
      }, ...prev]);
      form.reset();
    } catch (err) {
      setError((err as Error).message.toUpperCase());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="pixel-box" aria-labelledby="ask-h">
        <h2 id="ask-h">▶ INTERROGATE THE ARCHIVE</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="question">Your question, agent</label>
            <div className="prompt-row">
              <span className="prompt" aria-hidden="true">&gt;</span>
              <input
                id="question" name="question" type="text"
                required maxLength={500}
                placeholder="Who was at Pier 9?"
                autoComplete="off" enterKeyHint="send"
              />
            </div>
          </div>
          <button type="submit" className="btn btn-amber" disabled={busy}>
            {busy ? "INVESTIGATING..." : "INVESTIGATE"}
          </button>
        </form>

        <div className="terminal-wrap">
          {/* MEDIA SLOT 02 — sidekick */}
          <MediaSlot
            src="/media/robot.jpg"
            alt="Pixel-art robot analyst reading a case folder"
            label="SLOT 02 // robot.jpg"
            className="sidekick"
          />
          <div className="terminal" aria-live="polite" aria-busy={busy}>
            {busy && <p className="blink">DECRYPTING ARCHIVES<span className="dots" /></p>}
            {error && <p className="err">✖ {error}</p>}
            {!busy && !error && !report && (
              <p className="dim">AGENT K-8 STANDING BY. AWAITING QUERY...</p>
            )}
            {report && <p className="report">{typed}<span className="cursor">█</span></p>}
          </div>
        </div>

        {/* Action bar shown after a result */}
        {(report || error) && !busy && (
          <div className="result-actions">
            {evidence.length > 0 && (
              <button className="btn btn-sm btn-amber" onClick={() => openModal(evidence)}>
                VIEW {evidence.length} EXHIBITS
              </button>
            )}
            <button className="btn btn-sm" onClick={clearCurrent}>
              CLEAR
            </button>
          </div>
        )}
      </section>

      {/* History */}
      <HistoryPanel entries={history} onViewEvidence={openModal} />

      {/* Evidence modal — one shared instance */}
      <EvidenceModal evidence={modalEvidence} dialogRef={dialogRef} />
    </>
  );
}

/* ---------------- archive ---------------- */
function Archive({
  cases,
  error,
  onDelete,
}: {
  cases: CaseFile[] | null;
  error: string;
  onDelete: (id: number) => void;
}) {
  return (
    <section className="pixel-box" aria-labelledby="arch-h">
      <h2 id="arch-h">▶ THE ARCHIVES</h2>
      <ul className="archive">
        {error && <li className="err">✖ {error}</li>}
        {!error && cases === null && <li className="dim">LOADING...</li>}
        {cases?.length === 0 && <li className="dim">NO FILES ON RECORD. THE CABINET IS EMPTY.</li>}
        {cases?.map((c) => (
          <li key={c.id} className="folder">
            <span className="folder-tab" aria-hidden="true">#{String(c.id).padStart(4, "0")}</span>
            <div>
              <strong>{c.title}</strong>
              <small>{c.chunks} CHUNKS · {new Date(c.created_at).toLocaleDateString()}</small>
            </div>
            <button
              className="btn btn-red btn-sm"
              onClick={() => onDelete(c.id)}
              aria-label={`Shred ${c.title}`}
            >
              SHRED
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- root ---------------- */
export default function Bureau() {
  const [cases, setCases] = useState<CaseFile[] | null>(null);
  const [archiveErr, setArchiveErr] = useState("");

  const refresh = useCallback(() => {
    api
      .listCases()
      .then((c) => { setCases(c); setArchiveErr(""); })
      .catch(() =>
        setArchiveErr("CANNOT REACH ARCHIVE. IS THE GO API RUNNING ON :8080?")
      );
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function shred(id: number) {
    if (!confirm("Shred this case file permanently?")) return;
    await api.deleteCase(id).catch(() => {});
    refresh();
  }

  return (
    <>
      <div className="grid">
        <UploadPanel onUploaded={refresh} />
        <InvestigatePanel />
      </div>
      <Archive cases={cases} error={archiveErr} onDelete={shred} />
    </>
  );
}

export { StatusLed };

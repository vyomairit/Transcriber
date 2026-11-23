import { useCallback, useEffect, useState } from "react";
import { health } from "./api";
import { loadHistory, saveHistory } from "./utils";
import UploadPanel from "./components/UploadPanel";
import JobList from "./components/JobList";
import JobView from "./components/JobView";

export default function App() {
  const [history, setHistory] = useState(loadHistory);
  const [selected, setSelected] = useState(() => loadHistory()[0]?.job_id ?? null);
  // Object URLs of files uploaded in this tab, so the player can replay them.
  // The backend deletes the audio after transcription, so this can't come from the server.
  const [audioUrls, setAudioUrls] = useState({});
  const [backendUp, setBackendUp] = useState(null);

  useEffect(() => {
    const check = () => health().then(() => setBackendUp(true), () => setBackendUp(false));
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const upsertJob = useCallback((job) => {
    setHistory((prev) => {
      const i = prev.findIndex((j) => j.job_id === job.job_id);
      const entry = {
        job_id: job.job_id,
        filename: job.filename ?? prev[i]?.filename,
        status: job.status,
        duration_sec: job.duration_sec ?? prev[i]?.duration_sec,
        created: prev[i]?.created ?? Date.now(),
      };
      if (i === -1) return [entry, ...prev];
      const next = [...prev];
      next[i] = entry;
      return next;
    });
  }, []);

  const onUploaded = (job, file) => {
    upsertJob(job);
    setAudioUrls((m) => ({ ...m, [job.job_id]: URL.createObjectURL(file) }));
    setSelected(job.job_id);
  };

  const removeJob = (id) => {
    setHistory((prev) => prev.filter((j) => j.job_id !== id));
    if (selected === id) setSelected(null);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600 text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Audio → Insight</h1>
              <p className="text-xs text-slate-500">Transcribe, summarize and ask questions about your audio</p>
            </div>
          </div>
          <BackendBadge up={backendUp} />
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-6">
          <UploadPanel onUploaded={onUploaded} disabled={backendUp === false} />
          <JobList
            jobs={history}
            selected={selected}
            onSelect={setSelected}
            onRemove={removeJob}
            onOpenById={(id) => {
              upsertJob({ job_id: id, status: "queued" });
              setSelected(id);
            }}
          />
        </aside>
        <section className="min-w-0">
          {selected ? (
            <JobView key={selected} jobId={selected} audioUrl={audioUrls[selected]} onUpdate={upsertJob} />
          ) : (
            <EmptyState />
          )}
        </section>
      </main>
    </div>
  );
}

function BackendBadge({ up }) {
  const [label, cls] =
    up === null
      ? ["Checking backend…", "bg-slate-100 text-slate-600"]
      : up
      ? ["Backend online", "bg-emerald-50 text-emerald-700"]
      : ["Backend offline", "bg-rose-50 text-rose-700"];
  return (
    <span className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${cls}`}>
      <span className={`h-2 w-2 rounded-full ${up ? "bg-emerald-500" : up === false ? "bg-rose-500" : "bg-slate-400"}`} />
      {label}
    </span>
  );
}

function EmptyState() {
  const steps = [
    ["Upload", "Drop an audio file up to 40 minutes."],
    ["Transcribe", "faster-whisper turns speech into timestamped text."],
    ["Summarize", "Get bullets, a paragraph, or action items."],
    ["Ask", "Chat with the transcript; answers cite [mm:ss]."],
  ];
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-xl font-semibold">Start by uploading a recording</h2>
      <p className="mt-1 text-sm text-slate-500">Your jobs will show up on the left.</p>
      <ol className="mx-auto mt-8 grid max-w-3xl gap-4 text-left sm:grid-cols-4">
        {steps.map(([t, d], i) => (
          <li key={t} className="rounded-xl bg-slate-50 p-4">
            <span className="text-xs font-semibold text-indigo-600">Step {i + 1}</span>
            <p className="mt-1 font-medium">{t}</p>
            <p className="mt-1 text-sm text-slate-500">{d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

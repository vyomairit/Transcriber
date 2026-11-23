import { useEffect, useRef, useState } from "react";
import { getJob } from "../api";
import { duration } from "../utils";
import StatusBadge from "./StatusBadge";
import TranscriptTab from "./TranscriptTab";
import SummaryTab from "./SummaryTab";
import AskTab from "./AskTab";

const STEPS = [
  ["queued", "Queued"],
  ["transcribing", "Transcribing"],
  ["indexing", "Indexing"],
  ["done", "Ready"],
];
const TERMINAL = new Set(["done", "error"]);

export default function JobView({ jobId, audioUrl, onUpdate }) {
  const [job, setJob] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState("transcript");
  const [currentTime, setCurrentTime] = useState(0);
  const audio = useRef(null);

  // Poll GET /jobs/{id} until the job reaches done or error.
  useEffect(() => {
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const j = await getJob(jobId);
        if (cancelled) return;
        setJob(j);
        setLoadError(null);
        onUpdate(j);
        if (!TERMINAL.has(j.status)) timer = setTimeout(poll, 2000);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e.message);
        if (e.message !== "Job not found") timer = setTimeout(poll, 4000);
      }
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, onUpdate]);

  const seek = (t) => {
    if (!audio.current) return;
    audio.current.currentTime = t;
    audio.current.play().catch(() => {});
  };

  if (!job) {
    return (
      <Card>
        {loadError ? (
          <p className="text-sm text-rose-700">{loadError}</p>
        ) : (
          <p className="animate-pulse text-sm text-slate-500">Loading job…</p>
        )}
      </Card>
    );
  }

  const ready = job.status === "done";
  const tabs = [
    ["transcript", "Transcript"],
    ["summary", "Summary"],
    ["ask", "Ask"],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{job.filename || "Untitled"}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <StatusBadge status={job.status} />
              <span>Duration: {duration(job.duration_sec)}</span>
              {job.language && <span>Language: {job.language.toUpperCase()}</span>}
              {job.segments && <span>{job.segments.length} segments</span>}
            </div>
          </div>
          <CopyId id={jobId} />
        </div>

        {job.status === "error" ? (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Transcription failed: {job.error || "unknown error"}
          </p>
        ) : (
          !ready && <Stepper status={job.status} />
        )}

        {ready && audioUrl && (
          <audio
            ref={audio}
            src={audioUrl}
            controls
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            className="mt-4 w-full"
          />
        )}
        {ready && !audioUrl && (
          <p className="mt-3 text-xs text-slate-400">
            Audio playback is only available in the tab you uploaded from (the server deletes audio after transcribing).
          </p>
        )}
      </Card>

      {ready && (
        <Card className="p-0">
          <nav className="flex gap-1 border-b border-slate-200 px-3 pt-2">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                  tab === key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="p-4 sm:p-6">
            {/* Tabs stay mounted so summaries and chat survive switching. */}
            <div hidden={tab !== "transcript"}>
              <TranscriptTab job={job} currentTime={audioUrl ? currentTime : null} onSeek={audioUrl ? seek : null} />
            </div>
            <div hidden={tab !== "summary"}>
              <SummaryTab job={job} />
            </div>
            <div hidden={tab !== "ask"}>
              <AskTab job={job} onSeek={audioUrl ? seek : null} />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Card({ children, className = "p-4 sm:p-6" }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function Stepper({ status }) {
  const current = STEPS.findIndex(([s]) => s === status);
  return (
    <ol className="mt-5 grid grid-cols-4 gap-2">
      {STEPS.map(([key, label], i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li key={key}>
            <div
              className={`h-1.5 rounded-full ${
                state === "done" ? "bg-indigo-500" : state === "active" ? "animate-pulse bg-indigo-300" : "bg-slate-200"
              }`}
            />
            <p className={`mt-2 text-xs font-medium ${state === "todo" ? "text-slate-400" : "text-slate-700"}`}>{label}</p>
          </li>
        );
      })}
    </ol>
  );
}

function CopyId({ id }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      title="Copy job ID"
      className="rounded-lg border border-slate-200 px-2.5 py-1 font-mono text-xs text-slate-500 hover:bg-slate-50"
    >
      {copied ? "Copied!" : `${id.slice(0, 8)}…`}
    </button>
  );
}

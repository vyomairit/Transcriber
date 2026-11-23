import { useMemo, useState } from "react";
import { baseName, download, toSrt, ts } from "../utils";
import CopyButton from "./CopyButton";

export default function TranscriptTab({ job, currentTime, onSeek }) {
  const [query, setQuery] = useState("");
  const segments = job.segments || [];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? segments.filter((s) => s.text.toLowerCase().includes(q)) : segments;
  }, [segments, query]);

  if (!segments.length) {
    return <p className="text-sm text-slate-500">No speech was detected in this recording.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search transcript…"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <CopyButton text={job.text || ""} label="Copy text" />
        <button
          onClick={() => download(`${baseName(job.filename)}.txt`, job.text || "")}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          .txt
        </button>
        <button
          onClick={() => download(`${baseName(job.filename)}.srt`, toSrt(segments))}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          .srt
        </button>
      </div>
      {query && (
        <p className="mb-2 text-xs text-slate-500">
          {visible.length} of {segments.length} segments match
        </p>
      )}
      <ul className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
        {visible.map((s) => {
          const active = currentTime != null && currentTime >= s.start && currentTime < s.end;
          return (
            <li
              key={`${s.start}-${s.end}`}
              className={`flex gap-3 rounded-lg px-2 py-1.5 ${active ? "bg-indigo-50" : "hover:bg-slate-50"}`}
            >
              <button
                disabled={!onSeek}
                onClick={() => onSeek?.(s.start)}
                className="shrink-0 pt-0.5 font-mono text-xs text-indigo-600 enabled:hover:underline disabled:text-slate-400"
                title={onSeek ? "Play from here" : undefined}
              >
                {ts(s.start)}
              </button>
              <p className="text-sm leading-relaxed">
                <Highlight text={s.text} query={query} />
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Highlight({ text, query }) {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded bg-amber-200 px-0.5">
        {p}
      </mark>
    ) : (
      p
    )
  );
}

import { useState } from "react";
import StatusBadge from "./StatusBadge";
import { duration } from "../utils";

export default function JobList({ jobs, selected, onSelect, onRemove, onOpenById }) {
  const [id, setId] = useState("");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent jobs</h2>
      {jobs.length === 0 ? (
        <p className="text-sm text-slate-500">No jobs yet.</p>
      ) : (
        <ul className="-mx-2 max-h-[45vh] space-y-1 overflow-y-auto">
          {jobs.map((j) => (
            <li key={j.job_id} className="group relative">
              <button
                onClick={() => onSelect(j.job_id)}
                className={`w-full rounded-lg px-2 py-2 pr-8 text-left transition ${
                  selected === j.job_id ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-slate-50"
                }`}
              >
                <p className="truncate text-sm font-medium">{j.filename || j.job_id}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <StatusBadge status={j.status} />
                  <span>{duration(j.duration_sec)}</span>
                </div>
              </button>
              <button
                onClick={() => onRemove(j.job_id)}
                title="Remove from list"
                className="absolute right-2 top-2 rounded p-1 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 flex gap-2 border-t border-slate-100 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = id.trim();
          if (v) onOpenById(v);
          setId("");
        }}
      >
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Open job by ID"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">Open</button>
      </form>
    </div>
  );
}

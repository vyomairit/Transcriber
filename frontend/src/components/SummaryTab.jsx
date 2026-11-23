import { useState } from "react";
import { summarize } from "../api";
import { baseName, download } from "../utils";
import CopyButton from "./CopyButton";
import Markdownish from "./Markdownish";

const STYLES = [
  ["bullets", "Bullet points", "Concise key points"],
  ["paragraph", "Paragraph", "One or two tight paragraphs"],
  ["action_items", "Action items", "Tasks with owners"],
];

export default function SummaryTab({ job }) {
  const [style, setStyle] = useState("bullets");
  const [instructions, setInstructions] = useState("");
  const [results, setResults] = useState({}); // style -> {summary, method}
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const result = results[style];

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await summarize(job.job_id, style, instructions.trim());
      setResults((m) => ({ ...m, [style]: r }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {STYLES.map(([key, label, hint]) => (
          <button
            key={key}
            onClick={() => setStyle(key)}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              style === key ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-slate-500">{hint}</p>
          </button>
        ))}
      </div>
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={2}
        placeholder="Optional extra instructions, e.g. “Focus on budget decisions” or “Answer in Hindi”"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <button
        onClick={run}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {loading ? "Summarizing…" : result ? "Regenerate" : "Generate summary"}
      </button>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {result && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
              {result.method === "map_reduce" ? "Map-reduce (long transcript)" : "Single pass"}
            </span>
            <div className="flex gap-2">
              <CopyButton text={result.summary} />
              <button
                onClick={() => download(`${baseName(job.filename)}-${style}.md`, result.summary, "text/markdown")}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Download
              </button>
            </div>
          </div>
          <Markdownish text={result.summary} />
        </div>
      )}
    </div>
  );
}

const STYLES = {
  queued: "bg-slate-100 text-slate-700",
  transcribing: "bg-amber-50 text-amber-700",
  indexing: "bg-sky-50 text-sky-700",
  done: "bg-emerald-50 text-emerald-700",
  error: "bg-rose-50 text-rose-700",
};

export default function StatusBadge({ status }) {
  const active = status === "queued" || status === "transcribing" || status === "indexing";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status] || STYLES.queued}`}>
      {active && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {status}
    </span>
  );
}

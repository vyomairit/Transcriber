import { useState } from "react";

export default function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        })
      }
      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
    >
      {done ? "Copied!" : label}
    </button>
  );
}

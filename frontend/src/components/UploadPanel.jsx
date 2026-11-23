import { useRef, useState } from "react";
import { uploadAudio } from "../api";

const ACCEPT = "audio/*,video/*,.mp3,.wav,.m4a,.ogg,.flac,.webm,.mp4,.aac";

export default function UploadPanel({ onUploaded, disabled }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(null); // null | 0..1 | "probing"
  const [error, setError] = useState(null);
  const busy = progress !== null;

  async function handle(file) {
    if (!file || busy) return;
    setError(null);
    setProgress(0);
    try {
      const job = await uploadAudio(file, (p) => setProgress(p >= 1 ? "probing" : p));
      onUploaded(job, file);
    } catch (e) {
      setError(e.message);
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">New transcription</h2>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handle(e.dataTransfer.files?.[0]);
        }}
        className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition
          ${drag ? "border-indigo-500 bg-indigo-50" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"}
          disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <svg viewBox="0 0 24 24" className="h-8 w-8 text-indigo-500" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="mt-2 text-sm font-medium">
          {busy ? "Uploading…" : "Drop audio here or click to browse"}
        </span>
        <span className="mt-1 text-xs text-slate-500">MP3, WAV, M4A, OGG… · max 40 MB · max 40 min</span>
      </button>
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => handle(e.target.files?.[0])} />

      {busy && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full bg-indigo-500 transition-all ${progress === "probing" ? "w-full animate-pulse" : ""}`}
              style={progress === "probing" ? undefined : { width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {progress === "probing" ? "Checking audio duration…" : `${Math.round(progress * 100)}% uploaded`}
          </p>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </div>
  );
}

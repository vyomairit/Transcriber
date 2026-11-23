import { useEffect, useRef, useState } from "react";
import { ask, askStream } from "../api";
import { ts } from "../utils";
import Markdownish from "./Markdownish";

// The server keeps no chat state; it trims to its own max_history_turns, this just bounds the payload.
const MAX_HISTORY = 12;

/** Completed turns as the API expects them: [{role, content}], oldest first. */
function toHistory(messages) {
  const turns = [];
  for (let i = 0; i + 1 < messages.length; i += 2) {
    const [q, a] = [messages[i], messages[i + 1]];
    // Skip failed exchanges so the model doesn't build on an error or an empty answer.
    if (a.error || a.pending || !a.text.trim()) continue;
    turns.push({ role: "user", content: q.text }, { role: "assistant", content: a.text });
  }
  return turns.slice(-MAX_HISTORY);
}

const SUGGESTIONS = ["What were the main topics discussed?", "What decisions were made?", "Were any deadlines mentioned?"];

export default function AskTab({ job, onSeek }) {
  const [messages, setMessages] = useState([]); // {role, text, citations?, mode?, error?}
  const [question, setQuestion] = useState("");
  const [stream, setStream] = useState(true);
  const [k, setK] = useState(4);
  const [busy, setBusy] = useState(false);
  const abort = useRef(null);
  const bottom = useRef(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);
  useEffect(() => () => abort.current?.abort(), []);

  const patchLast = (fn) => setMessages((m) => [...m.slice(0, -1), fn(m[m.length - 1])]);

  async function send(q) {
    q = q.trim();
    if (!q || busy) return;
    const history = toHistory(messages);
    setQuestion("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "", pending: true }]);
    try {
      if (stream) {
        abort.current = new AbortController();
        await askStream(job.job_id, q, k, history, (tok) => patchLast((msg) => ({ ...msg, text: msg.text + tok })), abort.current.signal);
        patchLast((msg) => ({ ...msg, pending: false }));
      } else {
        const r = await ask(job.job_id, q, k, history);
        patchLast(() => ({
          role: "assistant",
          text: r.answer,
          citations: r.citations,
          mode: r.mode,
          searchQuery: r.search_query && r.search_query !== q ? r.search_query : null,
        }));
      }
    } catch (e) {
      if (e.name === "AbortError") patchLast((msg) => ({ ...msg, pending: false, text: msg.text + " …(stopped)" }));
      else patchLast((msg) => ({ ...msg, pending: false, error: e.message }));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={stream} onChange={(e) => setStream(e.target.checked)} className="accent-indigo-600" />
          Stream answer
        </label>
        <label className="inline-flex items-center gap-2" title="How many transcript chunks to retrieve">
          Context chunks
          <input
            type="number"
            min={1}
            max={20}
            value={k}
            onChange={(e) => setK(Number(e.target.value) || 1)}
            className="w-16 rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
        {stream && <span className="text-xs text-slate-400">Turn off streaming to see source citations.</span>}
        {messages.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setMessages([])}
            title="Start over; earlier questions won't be used as context"
            className="ml-auto rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            New chat
          </button>
        )}
      </div>

      <div className="min-h-48 max-h-[55vh] space-y-4 overflow-y-auto rounded-xl bg-slate-50 p-4">
        {messages.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-slate-500">Ask anything about this recording. Follow-up questions remember the conversation.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full bg-white px-3 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200 hover:ring-indigo-300">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-sm text-white">{m.text}</p>
            </div>
          ) : (
            <div key={i} className="max-w-[90%] rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
              {m.error ? (
                <p className="text-sm text-rose-700">{m.error}</p>
              ) : m.text ? (
                <Markdownish text={m.text} onSeek={onSeek} />
              ) : (
                <span className="inline-flex gap-1">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
              )}
              {m.citations?.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <p className="mb-1 text-xs font-medium text-slate-500">Sources</p>
                  <ul className="space-y-1">
                    {m.citations.map((c, j) => (
                      <li key={j} className="text-xs text-slate-600">
                        <button
                          disabled={!onSeek}
                          onClick={() => onSeek?.(c.start)}
                          className="mr-1 font-mono text-indigo-600 enabled:hover:underline disabled:text-slate-500"
                        >
                          [{ts(c.start)}–{ts(c.end)}]
                        </button>
                        {c.text}…
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {m.searchQuery && (
                <p className="mt-2 text-xs text-slate-500">
                  Searched for: <span className="italic">“{m.searchQuery}”</span>
                </p>
              )}
              {m.mode && (
                <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">
                  {m.mode === "rag" ? "Retrieved context" : "Full transcript"}
                </p>
              )}
            </div>
          )
        )}
        <div ref={bottom} />
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(question);
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about the transcript…"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {busy && stream ? (
          <button type="button" onClick={() => abort.current?.abort()} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white">
            Stop
          </button>
        ) : (
          <button disabled={busy || !question.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
            Ask
          </button>
        )}
      </form>
    </div>
  );
}

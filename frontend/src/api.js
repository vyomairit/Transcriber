// Thin client for the FastAPI backend (see ../../main.py).
export const API_BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

async function errorMessage(res) {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((d) => d.msg).join("; ");
    return JSON.stringify(body);
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error("Cannot reach the backend. Is the FastAPI server running?");
  }
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

const json = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const health = () => request("/");
export const getJob = (jobId) => request(`/jobs/${jobId}`);
export const summarize = (jobId, style, instructions) =>
  request(`/summarize/${jobId}`, json({ style, instructions: instructions || null }));
export const ask = (jobId, question, k, history = []) =>
  request(`/ask/${jobId}`, json({ question, k: k || null, history }));

/** POST /transcribe with upload progress (fetch has no upload progress, so XHR). */
export function uploadAudio(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/transcribe`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body?.detail || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Cannot reach the backend. Is the FastAPI server running?"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

/**
 * POST /ask/{id}/stream and feed tokens to onToken as they arrive.
 * EventSource only supports GET, so the SSE stream is parsed by hand.
 */
export async function askStream(jobId, question, k, history, onToken, signal) {
  let res;
  try {
    res = await fetch(`${API_BASE}/ask/${jobId}/stream`, { ...json({ question, k: k || null, history }), signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("Cannot reach the backend. Is the FastAPI server running?");
  }
  if (!res.ok) throw new Error(await errorMessage(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      // Per the SSE spec: multiple data: lines join with "\n"; one leading space is dropped.
      const data = event
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data === "[DONE]") return;
      onToken(data);
    }
  }
}

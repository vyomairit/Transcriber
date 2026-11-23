# Audio -> Insight

Upload audio (<= 40 min) -> faster-whisper transcript -> AWS Bedrock (Nova Micro)
summarization and RAG-based Q&A over Chroma, with Ollama (`nomic-embed-text`) embeddings.

## Running

Backend (needs Bedrock access and a local Ollama with `nomic-embed-text` pulled).
AWS credentials can go in `.env` (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional
`AWS_SESSION_TOKEN`, `AWS_DEFAULT_REGION`); if omitted, boto3's default chain is used
(environment, `~/.aws`, IAM role):

    uv sync
    uv run uvicorn main:app --reload --port 8000

Web UI (React + Vite + Tailwind, in `frontend/`):

    cd frontend
    npm install
    npm run dev        # http://localhost:5173, proxies /api -> http://localhost:8000

The UI covers the full flow: drag-and-drop upload with progress, live job status
(queued -> transcribing -> indexing -> done), searchable transcript with click-to-seek
audio playback and .txt/.srt export, summaries in three styles, and a Q&A chat with
streamed answers or cited sources. Set `BACKEND_URL` to proxy elsewhere, or
`VITE_API_URL` to call the API directly (add the UI origin to `CORS_ORIGINS`).

## Flow

### POST /transcribe

Upload an audio file to start transcription.

Request:

    curl -F "file=@meeting.mp3" http://localhost:8000/transcribe

Response:

    {
      "job_id": "...",
      "status": "pending"
    }

### GET /jobs/{job_id}

Check job status and retrieve transcript metadata.

Request:

    curl http://localhost:8000/jobs/<job_id>

Response:

    {
      "job_id": "...",
      "status": "done",
      "transcript": "...",
      "segments": [ ... ]
    }

### POST /summarize/{job_id}

Summarize a completed transcript.

Request:

    curl -X POST http://localhost:8000/summarize/<job_id> \
      -H "Content-Type: application/json" \
      -d '{"style":"action_items"}'

Response:

    {
      "summary": "...",
      "style": "action_items"
    }

### POST /ask/{job_id}

Ask a question about transcript content. For follow-ups, send the earlier turns
in `history` (oldest first); the server keeps no chat state.

Request:

    curl -X POST http://localhost:8000/ask/<job_id> \
      -H "Content-Type: application/json" \
      -d '{"question":"Who owns that?",
           "history":[{"role":"user","content":"What did they decide about the deadline?"},
                      {"role":"assistant","content":"It moved to March 15 [00:07]."}]}'

Response:

    {
      "answer": "...",
      "citations": [ ... ],
      "search_query": "Who owns the March 15 deadline?"
    }

### POST /ask/{job_id}/stream

Stream an answer using Server-Sent Events.

Request:

    curl -N -X POST http://localhost:8000/ask/<job_id>/stream \
      -H "Content-Type: application/json" \
      -d '{"question":"Summarize the risks discussed."}'

## Design notes

- **40-min cap** is gated from container metadata (`probe_duration`) *before*
  any transcription runs — a 3-hour file is rejected in milliseconds.
- **Whisper model loads once** at startup (lifespan), never per request.
- **Blocking work stays off the event loop**: transcription runs in a
  background thread; summarize/ask are sync `def` (threadpool).
- **Chunking follows Whisper segment boundaries** and keeps timestamps as
  metadata, so RAG answers can cite [mm:ss].
- **Conversation history is client-held.** With `history`, a follow-up is first
  rewritten into a standalone question (one extra small LLM call) so retrieval
  matches the right chunks. The last `max_history_turns` messages (default 6) then go
  into the answer prompt. A first question skips the rewrite.
- **`num_ctx=16384`** overrides Ollama's ~2k default so long transcripts
  aren't silently truncated.

## Scaling past v1

The in-memory `JobStore` + `BackgroundTasks` are single-process. For multiple
workers, retries, or persistence across restarts, move `_process` to an
arq/Celery worker backed by Redis and store jobs + FAISS indexes externally.

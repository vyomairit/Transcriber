from contextlib import asynccontextmanager
import os
import uuid

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from src.config import get_settings
from src.jobs import JobStore
from src.rag import prepare
from src.schemas import AskRequest, AskResponse, JobStatus, SummarizeRequest, SummarizeResponse, TranscriptResponse
from src.transcription import Transcriber
from src.embed import build_index
from src.summarize import summarize

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    os.makedirs(settings.upload_dir, exist_ok=True)
    os.makedirs(settings.chroma_dir, exist_ok=True)
    transcriber = Transcriber(settings)
    transcriber.load()
    app.state.settings = settings
    app.state.transcriber = transcriber
    app.state.jobs = JobStore(settings.db_path)
    yield
    
    
app = FastAPI(title="Audio Transcript", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def health():
    return {"status": "ok"}

def _process(job_id: str, path: str, state):
    settings, transcriber, jobs = state.settings, state.transcriber, state.jobs
    
    try:
        jobs.update(job_id, status="transcribing")
        segments, text, duration, language = transcriber.transcribe(path)
        jobs.update(
            job_id, segments=segments, text=text,
            duration_sec=duration,
            language=language,
            status="indexing" if (settings.enable_rag and segments) else "done"
        )
        
        if settings.enable_rag and segments:
            build_index(segments, settings, collection_name=job_id)
            jobs.update(job_id, has_index=True, status="done")
    except Exception as ex:
        jobs.update(job_id, status="error", error=str(ex))
    finally:
        _remove(path)
        
@app.post("/transcribe", response_model=JobStatus)
async def transcribe(request: Request, background: BackgroundTasks, file: UploadFile = File(...)):
    settings, transcriber, jobs = request.app.state.settings, request.app.state.transcriber, request.app.state.jobs
    # basename() stops a crafted filename like "../../x" escaping upload_dir
    filename = os.path.basename(file.filename or "upload")
    # Save and validate under a temp name first; the job is only created once the
    # audio is accepted, so rejected uploads don't leave orphan "queued" jobs behind.
    path = os.path.join(settings.upload_dir, f"{uuid.uuid4().hex}_{filename}")

    try:
        await _save_upload(file, path, settings.max_upload_mb * 1024 * 1024)
        try:
            duration = await run_in_threadpool(transcriber.probe_duration, path)
        except Exception as ex:
            raise HTTPException(400, f"Unreadable audio: {ex}")
        if duration > settings.max_audio_seconds:
            raise HTTPException(
                413, f"Audio is {duration / 60:.1f} min; limit is {settings.max_audio_seconds / 60:.0f} min",
            )
    except BaseException:
        _remove(path)
        raise

    job = jobs.create(filename=filename)
    jobs.update(job.job_id, duration_sec=duration, status="queued")
    background.add_task(_process, job.job_id, path, request.app.state)
    return JobStatus(job_id=job.job_id, status="queued", duration_sec=duration, filename=filename)


async def _save_upload(file: UploadFile, path: str, max_bytes: int):
    size = 0
    with open(path, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                raise HTTPException(413, f"File exceeds {max_bytes // (1024 * 1024)} MB limit")
            # disk writes are blocking; keep them off the event loop
            await run_in_threadpool(out.write, chunk)


def _remove(path: str):
    try:
        os.remove(path)
    except OSError:
        pass


@app.get("/jobs/{job_id}", response_model=TranscriptResponse)
async def get_job(job_id:str, request:Request):
    job = request.app.state.jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    done = job.status== "done"
    return TranscriptResponse(
        job_id=job_id, status=job.status, error=job.error,
        duration_sec=job.duration_sec, language=job.language,
        filename=job.filename,
        text=job.text if done else None,
        segments=job.segments if done else None
    )
    
def _require_ready(request: Request, job_id: str):
    job = request.app.state.jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    if job.status == "error":
        raise HTTPException(409, f"Job failed: {job.error}")
    if job.status != "done" or not job.text:
        raise HTTPException(409, f"Job not ready (status={job.status})")
    return job

@app.post("/summarize/{job_id}", response_model=SummarizeResponse)
def summarize_job(job_id: str, req: SummarizeRequest, request: Request):
    job = _require_ready(request, job_id)
    settings = request.app.state.settings
    summary, method = summarize(job.text, req.style, req.instructions, settings)
    return SummarizeResponse(job_id=job_id, summary=summary, method=method)
 
@app.post("/ask/{job_id}", response_model=AskResponse)
def ask_job(job_id:str, req:AskRequest, request:Request):
    job = _require_ready(request, job_id)
    settings = request.app.state.settings
    
    if req.k:
        settings = settings.model_copy(update={"retriever_top_k":req.k})
    
    chain, inputs, citations, mode, search_query = prepare(req.question, job, settings, req.history)
    answer = chain.invoke(inputs).text
    return AskResponse(
        job_id=job_id, answer=answer, mode=mode, citations=citations, search_query=search_query,
    )

@app.post("/ask/{job_id}/stream")
async def ask_job_stream(job_id: str, req: AskRequest, request: Request):
    job = _require_ready(request, job_id)
    settings = request.app.state.settings
    if req.k:
        settings = settings.model_copy(update={"retriever_top_k": req.k})
    # prepare() may rewrite the question with the LLM, embeds it and hits Chroma, all
    # synchronously; keep it off the event loop
    chain, inputs, _citations, _mode, _query = await run_in_threadpool(
        prepare, req.question, job, settings, req.history,
    )

    async def token_stream():
        async for part in chain.astream(inputs):
            # Bedrock Converse streams content as a list of blocks; .text flattens it to str
            token = part.text
            if token:
                # one "data:" line per line of the token, so newlines survive SSE framing
                yield "".join(f"data: {line}\n" for line in token.split("\n")) + "\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(token_stream(), media_type="text/event-stream")

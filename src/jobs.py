import json
import sqlite3
import threading
import uuid
from dataclasses import dataclass, field
from typing import Optional
from .schemas import Segment

@dataclass
class Job:
    job_id: str
    status: str = "queued"
    filename: Optional[str] = None
    error: Optional[str] = None
    duration_sec: Optional[float] = None
    language: Optional[str] = None
    text: Optional[str] = None
    segments: list[Segment] = field(default_factory=list)
    has_index: bool = False

def _serialize(job: Job) -> str:
    return json.dumps({
        "job_id": job.job_id, "status": job.status, "filename": job.filename,
        "error": job.error, "duration_sec": job.duration_sec, "language": job.language,
        "text": job.text, "has_index": job.has_index,
        "segments": [s.model_dump() for s in job.segments],
    })

def _deserialize(row: str) -> Job:
    d = json.loads(row)
    d["segments"] = [Segment(**s) for s in d["segments"]]
    return Job(**d)

class JobStore:
    def __init__(self, db_path: str):
        self._lock = threading.Lock()
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.execute("CREATE TABLE IF NOT EXISTS jobs (job_id TEXT PRIMARY KEY, data TEXT)")
        self._db.commit()
        self._recover_interrupted()

    def _recover_interrupted(self):
        # Background tasks don't resume across restart; fail jobs stuck mid-flight
        # so clients stop polling forever.
        with self._lock:
            rows = self._db.execute("SELECT data FROM jobs").fetchall()
            for (row,) in rows:
                job = _deserialize(row)
                if job.status not in ("done", "error"):
                    job.status, job.error = "error", "interrupted by restart"
                    self._db.execute("UPDATE jobs SET data=? WHERE job_id=?",
                                     (_serialize(job), job.job_id))
            self._db.commit()

    def create(self, filename: str) -> Job:
        job = Job(job_id=uuid.uuid4().hex, filename=filename)
        with self._lock:
            self._db.execute("INSERT INTO jobs(job_id, data) VALUES(?, ?)",
                             (job.job_id, _serialize(job)))
            self._db.commit()
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            row = self._db.execute("SELECT data FROM jobs WHERE job_id=?", (job_id,)).fetchone()
        return _deserialize(row[0]) if row else None

    def update(self, job_id: str, **kwargs):
        with self._lock:
            row = self._db.execute("SELECT data FROM jobs WHERE job_id=?", (job_id,)).fetchone()
            if row is None:
                return
            job = _deserialize(row[0])
            for key, value in kwargs.items():
                setattr(job, key, value)
            self._db.execute("UPDATE jobs SET data=? WHERE job_id=?",
                             (_serialize(job), job_id))
            self._db.commit()

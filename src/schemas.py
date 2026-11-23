from typing import Literal, Optional
from pydantic import BaseModel, Field

class Segment(BaseModel):
    start: float = Field(..., description="Start time of the segment in seconds")
    end: float = Field(..., description="End time of the segment in seconds")
    text: str = Field(..., description="Transcribed text for the segment")
    
class JobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "transcribing", "indexing", "done", "error"]
    error: Optional[str] = None
    duration_sec: Optional[float] = None
    language: Optional[str] = None
    filename: Optional[str] = None
    
class TranscriptResponse(JobStatus):
    text: Optional[str] = None
    segments: Optional[list[Segment]] = None
    
class SummarizeRequest(BaseModel):
    style: Literal["bullets", "paragraph", "action_items"] = "bullets"
    instructions: Optional[str] = None
   
class SummarizeResponse(BaseModel):
    job_id: str
    summary: str
    method: Literal["single_shot", "map_reduce"]
    
class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AskRequest(BaseModel):
    question: str
    k: Optional[int] = None
    # Prior turns of this conversation, oldest first. The server is stateless:
    # the client sends the history it wants considered with every question.
    history: list[ChatTurn] = Field(default_factory=list)
    
    
class Citation(BaseModel):
    start: float
    end: float
    text:str
    
class AskResponse(BaseModel):
    job_id: str
    answer: str
    mode: Literal["rag", "stuffed"]
    citations: list[Citation] = Field(default_factory=list)
    # The query actually used for retrieval (a follow-up rewritten as a standalone question).
    search_query: Optional[str] = None
    
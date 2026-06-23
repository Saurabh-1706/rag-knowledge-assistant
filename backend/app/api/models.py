from pydantic import BaseModel
from typing import List, Optional

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[Message] = []
    retrieval_mode: str = "vector"

class Source(BaseModel):
    content: str
    source: str

class ConfidenceScore(BaseModel):
    score: int
    rationale: str

class ChatResponse(BaseModel):
    answer: str
    sources: List[Source]
    query_used: str
    notice: Optional[str] = None
    confidence: Optional[ConfidenceScore] = None

class DocumentInfo(BaseModel):
    name: str
    size: int
    chunks: int
    uploaded_at: Optional[str] = None

class UploadResponse(BaseModel):
    success: bool
    chunks_created: int
    doc_name: str
    job_id: Optional[str] = None
    status: Optional[str] = None

class URLIngestRequest(BaseModel):
    url: str

class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    doc_name: str
    chunks_created: int
    error: Optional[str] = None

class EvalRequest(BaseModel):
    retrieval_mode: str = "vector"

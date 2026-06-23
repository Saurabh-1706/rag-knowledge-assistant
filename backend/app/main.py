import os
import shutil
import uuid
import asyncio
from typing import List, Dict, Any
from fastapi import FastAPI, UploadFile, File, HTTPException, Path, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from app import config
from app.core.vector_store import get_vector_store
from app.core.chat import generate_chat_response, generate_chat_response_stream
from app.core.ingestion import ingest_document, ingest_from_url
from app.core.retrieval import get_all_documents, retrieve_documents
from app.api.models import (
    ChatRequest, 
    ChatResponse, 
    DocumentInfo, 
    UploadResponse, 
    URLIngestRequest, 
    JobStatusResponse, 
    EvalRequest
)
from app.core.evaluator import run_evaluation_pipeline, get_evaluation_history

app = FastAPI(
    title="RAG Knowledge Assistant API",
    description="Backend API for document ingestion, retrieval, and Q&A",
    version="1.0.0"
)

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    """Verify backend health and count stored chunks"""
    try:
        db = get_vector_store()
        all_docs = get_all_documents(db)
        return {
            "status": "ok",
            "docs_count": len(all_docs)
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "docs_count": 0
        }

@app.post("/api/chat", response_model=ChatResponse)
def chat_endpoint(request: ChatRequest):
    """Q&A endpoint supporting different retrieval modes"""
    try:
        # Convert request history to list of dicts
        history_dicts = []
        for msg in request.history:
            history_dicts.append({
                "role": msg.role,
                "content": msg.content
            })
            
        result = generate_chat_response(
            message=request.message,
            history=history_dicts,
            retrieval_mode=request.retrieval_mode
        )
        return ChatResponse(
            answer=result["answer"],
            sources=result["sources"],
            query_used=result["query_used"],
            notice=result["notice"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/documents", response_model=List[DocumentInfo])
def get_documents_endpoint():
    """List all documents and their chunk counts in ChromaDB"""
    try:
        db = get_vector_store()
        docs_dir = config.DOCS_DIR
        
        # Count chunks per document in Chroma
        source_counts = {}
        try:
            data = db.get()
            if data and data.get("metadatas"):
                for meta in data["metadatas"]:
                    if meta and "source" in meta:
                        src = meta["source"]
                        source_counts[src] = source_counts.get(src, 0) + 1
        except Exception as e:
            print(f"Error fetching metadata from Chroma: {e}")
            
        doc_infos = []
        
        # 1. Scan physical docs directory
        if os.path.exists(docs_dir):
            for filename in os.listdir(docs_dir):
                filepath = os.path.join(docs_dir, filename)
                if os.path.isfile(filepath):
                    size = os.path.getsize(filepath)
                    
                    # Match source metadata variants (raw filename, relative docs/ path, etc.)
                    chunks = source_counts.get(filename, 0)
                    if chunks == 0:
                        chunks = source_counts.get(f"docs/{filename}", 0)
                    if chunks == 0:
                        chunks = source_counts.get(os.path.join("docs", filename), 0)
                    if chunks == 0:
                        chunks = source_counts.get(f"backend/docs/{filename}", 0)
                        
                    doc_infos.append(DocumentInfo(
                        name=filename,
                        size=size,
                        chunks=chunks
                    ))
        
        # 2. Add documents that exist in Chroma but not on disk
        for src, count in source_counts.items():
            base_src = os.path.basename(src)
            # If not already added
            if not any(d.name == base_src for d in doc_infos):
                doc_infos.append(DocumentInfo(
                    name=base_src,
                    size=0,
                    chunks=count
                ))
                
        return doc_infos
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

JOBS: Dict[str, Dict[str, Any]] = {}

def run_ingest_document_bg(job_id: str, filename: str, content: bytes):
    try:
        chunks = ingest_document(filename, content)
        JOBS[job_id]["status"] = "completed"
        JOBS[job_id]["chunks_created"] = chunks
    except Exception as e:
        print(f"Error in bg ingestion: {e}")
        JOBS[job_id]["status"] = "failed"
        JOBS[job_id]["error"] = str(e)

def run_ingest_url_bg(job_id: str, url: str):
    try:
        filename, chunks = ingest_from_url(url)
        JOBS[job_id]["status"] = "completed"
        JOBS[job_id]["doc_name"] = filename
        JOBS[job_id]["chunks_created"] = chunks
    except Exception as e:
        print(f"Error in bg URL ingestion: {e}")
        JOBS[job_id]["status"] = "failed"
        JOBS[job_id]["error"] = str(e)

@app.post("/api/documents/upload", response_model=UploadResponse)
async def upload_document_endpoint(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload a file, save it to the docs directory, and ingest it into ChromaDB in background"""
    try:
        filename = file.filename
        # Save file physically to docs directory
        docs_dir = config.DOCS_DIR
        os.makedirs(docs_dir, exist_ok=True)
        filepath = os.path.join(docs_dir, filename)
        
        # Read file contents
        content = await file.read()
        
        with open(filepath, "wb") as f:
            f.write(content)
            
        job_id = str(uuid.uuid4())
        JOBS[job_id] = {
            "status": "processing",
            "doc_name": filename,
            "chunks_created": 0,
            "error": None
        }
        
        background_tasks.add_task(run_ingest_document_bg, job_id, filename, content)
        
        return UploadResponse(
            success=True,
            chunks_created=0,
            doc_name=filename,
            job_id=job_id,
            status="processing"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/documents/status/{job_id}", response_model=JobStatusResponse)
def get_job_status_endpoint(job_id: str = Path(..., description="The ID of the background ingestion job")):
    """Get the status of a background document ingestion job"""
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="Job not found")
    job = JOBS[job_id]
    return JobStatusResponse(
        job_id=job_id,
        status=job["status"],
        doc_name=job["doc_name"],
        chunks_created=job["chunks_created"],
        error=job["error"]
    )

@app.delete("/api/documents/{name}")
def delete_document_endpoint(name: str = Path(..., description="The name of the document to delete")):
    """Delete a document from physical docs directory and all its chunks from ChromaDB"""
    try:
        db = get_vector_store()
        
        # 1. Delete chunks from ChromaDB
        # We find and delete all chunks matching name, docs/name, backend/docs/name etc.
        deleted_count = 0
        variants = [name, f"docs/{name}", os.path.join("docs", name), f"backend/docs/{name}"]
        
        for variant in variants:
            try:
                data = db.get(where={"source": variant})
                ids = data.get("ids", [])
                if ids:
                    db.delete(ids=ids)
                    deleted_count += len(ids)
            except Exception as e:
                print(f"Error deleting variant '{variant}' from Chroma: {e}")
                
        # 2. Delete physical file
        docs_dir = config.DOCS_DIR
        filepath = os.path.join(docs_dir, name)
        if os.path.exists(filepath):
            os.remove(filepath)
            
        if deleted_count == 0:
            # Try a partial check on source metadata if exact variants didn't match
            try:
                all_data = db.get()
                ids_to_delete = []
                for doc_id, meta in zip(all_data.get("ids", []), all_data.get("metadatas", [])):
                    if meta and "source" in meta and name in meta["source"]:
                        ids_to_delete.append(doc_id)
                if ids_to_delete:
                    db.delete(ids=ids_to_delete)
                    deleted_count += len(ids_to_delete)
            except Exception as e:
                print(f"Error in fallback metadata search/deletion: {e}")
                
        return {"success": True, "chunks_deleted": deleted_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/stream")
def chat_stream_endpoint(request: ChatRequest):
    """Q&A streaming endpoint returning Event-Stream chunks"""
    try:
        # Convert request history to list of dicts
        history_dicts = []
        for msg in request.history:
            history_dicts.append({
                "role": msg.role,
                "content": msg.content
            })
            
        generator = generate_chat_response_stream(
            message=request.message,
            history=history_dicts,
            retrieval_mode=request.retrieval_mode
        )
        return StreamingResponse(generator, media_type="text/event-stream")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/documents/url", response_model=UploadResponse)
def upload_url_endpoint(request: URLIngestRequest, background_tasks: BackgroundTasks):
    """Scrape a URL and ingest its content asynchronously in background"""
    try:
        from app.core.ingestion import url_to_filename
        filename = url_to_filename(request.url)
        
        job_id = str(uuid.uuid4())
        JOBS[job_id] = {
            "status": "processing",
            "doc_name": filename,
            "chunks_created": 0,
            "error": None
        }
        
        background_tasks.add_task(run_ingest_url_bg, job_id, request.url)
        
        return UploadResponse(
            success=True,
            chunks_created=0,
            doc_name=filename,
            job_id=job_id,
            status="processing"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/eval/run")
def run_evaluation_endpoint(request: EvalRequest):
    """Run RAG evaluation pipeline for a specific retrieval mode"""
    try:
        summary = run_evaluation_pipeline(request.retrieval_mode)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/eval/history")
def get_evaluation_history_endpoint():
    """Retrieve history of all evaluation runs"""
    try:
        return get_evaluation_history()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/eval/run/{filename}")
def get_evaluation_run_detail_endpoint(filename: str = Path(..., description="The filename of the run record")):
    """Retrieve full details of a specific evaluation run"""
    try:
        # Prevent path traversal
        if ".." in filename or "/" in filename or "\\" in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
            
        import json
        from app import config
        base_dir = config.BASE_DIR
        filepath = base_dir / "app" / "eval" / "runs" / filename
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="Run report not found")
            
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/compare")
async def compare_modes_endpoint(request: ChatRequest):
    """Retrieve context chunks for all four modes in parallel for comparison"""
    try:
        # Run retrieval in parallel for Vector, Hybrid, Rerank, and Multi-Query
        async def run_retrieval(mode):
            loop = asyncio.get_running_loop()
            docs, notice = await loop.run_in_executor(
                None, retrieve_documents, request.message, mode, 5
            )
            return {
                "mode": mode,
                "notice": notice,
                "chunks": [
                    {
                        "content": doc.page_content,
                        "source": doc.metadata.get("source", "unknown")
                    }
                    for doc in docs
                ]
            }
        
        modes = ["vector", "hybrid", "rerank", "multiquery"]
        tasks = [run_retrieval(m) for m in modes]
        results = await asyncio.gather(*tasks)
        
        # Format as key-value
        return {res["mode"]: {"chunks": res["chunks"], "notice": res["notice"]} for res in results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

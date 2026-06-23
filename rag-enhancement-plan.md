# RAG Knowledge Assistant — Enhancement Plan

A phased roadmap to evolve the project from a solid prototype into a portfolio-grade, production-aware AI system.

---

## Phase 1 — Quick Wins (1–3 days)
*High visibility, low effort. Do these first for immediate demo impact.*

---

### 1.1 Streaming Responses

**What:** Stream GPT-4o tokens to the frontend in real time instead of waiting for the full response.

**Why:** The single biggest UX upgrade. Zero latency feel, more professional, and shows you understand production AI patterns.

**Backend changes:**
- Replace `model.invoke()` with `model.stream()` in `chat.py`
- Add a new FastAPI route `POST /chat/stream` using `StreamingResponse` with `text/event-stream` content type
- Yield each token chunk as a Server-Sent Event (SSE)

**Frontend changes:**
- Use the `EventSource` API or `fetch` with `ReadableStream` in `lib/api.ts`
- Update chat UI to append tokens progressively as they arrive

**Files to touch:** `backend/app/core/chat.py`, `backend/app/main.py`, `frontend/lib/api.ts`, `frontend/app/chat/page.tsx`

---

### 1.2 Document Deletion

**What:** Add the ability to delete individual documents from the knowledge base via the UI.

**Why:** Right now the knowledge base is append-only. Without deletion, the project feels like a demo toy rather than a real tool.

**Backend changes:**
- Add `DELETE /documents/{source_name}` endpoint in `main.py`
- In `vector_store.py`, add a `delete_by_source(source: str)` function using ChromaDB's `delete()` with a `where` metadata filter

**Frontend changes:**
- Add a delete button (trash icon) next to each document in `app/documents/page.tsx`
- Confirm before deletion, then refresh the document list

**Files to touch:** `backend/app/main.py`, `backend/app/core/vector_store.py`, `frontend/app/documents/page.tsx`

---

### 1.3 URL Ingestion

**What:** Accept a URL as input, scrape its content, and ingest it into the knowledge base.

**Why:** Lets you demo the system without needing local files. Paste a Wikipedia article, a blog post, a docs page — instantly useful.

**Backend changes:**
- Add `POST /ingest/url` endpoint
- Use `httpx` + `BeautifulSoup` (or LangChain's `WebBaseLoader`) to extract readable text
- Pass extracted text through the existing `split_text_into_chunks` + `vector_store.add_documents` pipeline
- Store the URL as the `source` in metadata

**Frontend changes:**
- Add a URL input tab in the Documents page alongside the file upload

**Files to touch:** `backend/app/core/ingestion.py`, `backend/app/main.py`, `frontend/app/documents/page.tsx`

---

## Phase 2 — Retrieval Intelligence (3–7 days)
*Deeper RAG improvements that show ML/AI engineering depth.*

---

### 2.1 Multi-Query Retrieval

**What:** Before retrieval, use the LLM to generate 3 semantically different phrasings of the user's question. Run retrieval for each, deduplicate by content hash, then rank and pass the union to the generator.

**Why:** A single query vector can miss relevant chunks due to vocabulary mismatch. Multi-query is a well-known production RAG pattern — citing it in an interview carries real weight.

**Implementation:**
- Add `generate_query_variants(query: str, model, n=3) -> List[str]` in a new `backend/app/core/query_expansion.py`
- Run `retrieve_documents()` for each variant
- Deduplicate using `set` on `doc.page_content` hash
- Wire into `generate_chat_response()` in `chat.py` as a fourth retrieval mode: `"multi-query"`
- Add the mode option to the frontend mode switcher

**Files to touch:** `backend/app/core/` (new file), `backend/app/core/chat.py`, `backend/app/core/retrieval.py`, `frontend/app/chat/page.tsx`

---

### 2.2 Answer Confidence Score

**What:** After generating an answer, ask the LLM to self-assess how well the retrieved documents actually support it. Return a score (0–100) and a one-line rationale.

**Why:** Surfaces when the model is hallucinating or working with weak context. Makes the system feel transparent and production-honest.

**Implementation:**
- Add a second LLM call in `chat.py` after generation:
  ```
  "Given the documents and the answer below, rate from 0-100 how well the documents support the answer. Return JSON: {score: int, rationale: str}"
  ```
- Parse the JSON response and include `confidence: {score, rationale}` in the API response
- Show a colored confidence badge in the chat UI (green ≥ 75, yellow 40–74, red < 40)

**Files to touch:** `backend/app/core/chat.py`, `backend/app/api/models.py`, `frontend/app/chat/page.tsx`

---

### 2.3 Web Search Fallback

**What:** If the top retrieved chunks score below a relevance threshold, automatically fall back to a live web search (via Tavily or Serper API) before generating the answer.

**Why:** Makes the assistant genuinely useful even when the knowledge base doesn't have the answer. Shows you've thought about failure modes.

**Implementation:**
- After retrieval, compute average similarity score from ChromaDB's `similarity_search_with_score()`
- If max score < configurable threshold (e.g. 0.75), call Tavily's search API
- Prepend web results to the context with a `[Web]` source label
- Show a "sourced from web" indicator in the UI when fallback is triggered

**Files to touch:** `backend/app/core/retrieval.py`, `backend/app/core/chat.py`, `backend/app/config.py`, `frontend/app/chat/page.tsx`

---

## Phase 3 — Evaluation Pipeline (5–10 days)
*The thing that separates engineers from prompt engineers. Do this to stand out.*

---

### 3.1 RAGAS Evaluation Dashboard

**What:** Build an evaluation pipeline using [RAGAS](https://github.com/explodinggradients/ragas) that scores your RAG system on standard metrics, with results displayed in a dashboard tab.

**Why:** Almost no portfolio RAG projects include eval. This signals you think about RAG as a measurable engineering problem, not just a vibe.

**Metrics to track:**
| Metric | What it measures |
|---|---|
| Faithfulness | Does the answer stay grounded in the retrieved docs? |
| Answer Relevancy | Does the answer actually address the question? |
| Context Precision | Are the retrieved chunks relevant to the question? |
| Context Recall | Did retrieval surface all the chunks needed to answer? |

**Implementation:**
- Create `backend/app/eval/` directory
- Write a test set: 10–20 question/ground-truth answer pairs against your sample docs (Google, Nvidia, Tesla, etc.)
- Add `POST /eval/run` endpoint that runs RAGAS over the test set for a chosen retrieval mode
- Store results in a JSON file per run with a timestamp
- Add a new `/eval` page in the frontend showing:
  - Radar chart comparing all three retrieval modes across the four metrics
  - Per-question breakdown table
  - Run history with timestamps

**Files to touch:** `backend/app/eval/` (new directory), `backend/app/main.py`, `frontend/app/` (new page)

---

### 3.2 Retrieval Mode Comparison View

**What:** Run the same query across all three retrieval modes simultaneously and display the retrieved chunks side-by-side.

**Why:** Makes the difference between vector, hybrid, and rerank tangible and visual. Perfect for a portfolio demo or walkthrough video.

**Implementation:**
- Add `POST /compare` endpoint that runs all three retrieval modes in parallel (`asyncio.gather`) and returns the chunks for each
- Add a "Compare Modes" toggle in the chat UI
- Show three columns, one per mode, with the retrieved chunks ranked and highlighted

**Files to touch:** `backend/app/main.py`, `backend/app/core/retrieval.py`, `frontend/app/chat/page.tsx`

---

## Phase 4 — Production Readiness (3–5 days)
*Engineering hygiene that signals you can ship real software.*

---

### 4.1 Docker Compose Setup

**What:** Add a `docker-compose.yml` that spins up both the FastAPI backend and Next.js frontend with a single command.

**Why:** Makes the project instantly runnable for any recruiter or hiring manager who clones it. No Python env setup, no Node version issues.

**Implementation:**
- `Dockerfile` for backend (Python 3.11 slim, uvicorn entrypoint)
- `Dockerfile` for frontend (Node 18 alpine, `next build` + `next start`)
- `docker-compose.yml` at root with both services, shared `.env`, and volume mount for ChromaDB persistence
- Update README with `docker-compose up` quickstart

**Files to add:** `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`

---

### 4.2 Async Ingestion with Job Status

**What:** Large PDFs currently block the request thread during ingestion. Move ingestion to a background task with a job ID, and let the frontend poll for completion.

**Why:** Shows you understand async patterns and have thought about what happens at scale.

**Implementation:**
- Use FastAPI's `BackgroundTasks` or a simple in-memory job store (`dict` keyed by UUID)
- `POST /ingest` returns immediately with `{job_id: "uuid", status: "processing"}`
- `GET /ingest/status/{job_id}` returns `{status: "done" | "processing" | "error", chunks_added: int}`
- Frontend polls every 2s and shows a progress indicator while ingestion runs

**Files to touch:** `backend/app/main.py`, `backend/app/core/ingestion.py`, `frontend/app/documents/page.tsx`

---

## Implementation Order

```
Week 1   Streaming + Deletion + URL Ingestion         (Phase 1 — all three)
Week 2   Multi-Query + Confidence Score               (Phase 2 — 2.1, 2.2)
Week 3   RAGAS Eval + Comparison View                 (Phase 3 — both)
Week 4   Docker + Async Ingestion + Web Fallback      (Phase 4 + 2.3)
```

---

## What to Lead With in Interviews

- **Streaming** — most people don't implement this in portfolio projects
- **RAGAS eval dashboard** — almost nobody does this; it's your biggest differentiator
- **Three retrieval modes with graceful degradation** — already built, worth emphasizing explicitly
- **Multi-query retrieval** — shows you know production RAG patterns beyond the basics

---

*Generated against repo: `Saurabh-1706/rag-knowledge-assistant`*

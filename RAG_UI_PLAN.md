# RAG Knowledge Assistant — UI & Restructure Plan

> Repo: `github.com/Saurabh-1706/rag-knowledge-assistant`
> Goal: Add a production-grade UI, restructure into `backend/` + `frontend/`, ship a usable product.

---

## 1. Repo Analysis (Current State)

### What's in the repo right now

The repo is a **learning-oriented RAG exploration project** — 13 numbered Python scripts and notebooks, each demonstrating one concept in isolation:

| File | What it does |
|---|---|
| `1_ingestion_pipeline.py` | Loads `.txt` docs → chunks → stores in ChromaDB |
| `2_retrieval_pipeline.py` | Queries ChromaDB, returns top-k docs |
| `3_answer_generation.py` | Retrieves docs + calls GPT-4o to answer |
| `4_history_aware_generation.py` | Adds conversation memory (chat history) |
| `5_recursive_character_text_splitter.py` | Alternate chunking strategy |
| `6_semantic_chunking.py` | Embedding-based semantic chunking |
| `7_agentic_chunking.py` | LLM-decides-the-chunks approach |
| `8_multi_modal_rag.ipynb` | Image + text RAG (notebook) |
| `9_retrieval_methods.py` | Similarity / MMR / threshold comparisons |
| `10_multi_query_retrieval.py` | Generates query variations, merges results |
| `11_reciprocal_rank_fusion.py` | Hybrid re-ranking with RRF |
| `12_hybrid_search.ipynb` | BM25 + semantic search combined |
| `13_reranker.ipynb` | Cohere reranker on top of retrieval |

**Tech stack in use:**
- LangChain (core, openai, chroma, text-splitters, cohere)
- ChromaDB (local vector store, persisted at `db/chroma_db`)
- OpenAI `text-embedding-3-small` + `gpt-4o`
- Python `dotenv` for secrets
- `docs/` folder: Google, Microsoft, Nvidia, SpaceX, Tesla `.txt` files + a PDF (attention paper)

### Gaps / what's missing

- No API layer — everything is CLI scripts
- No file upload mechanism
- No web interface
- Scripts are not modularized into reusable functions
- No environment config beyond `.env`
- No error handling for production use
- The most powerful features (hybrid search `#12`, reranker `#13`, history-aware `#4`) are buried in scripts/notebooks — none exposed

---

## 2. Chosen UI: Next.js + Tailwind CSS

### Why Next.js (not React SPA, not Streamlit)

| Option | Verdict | Reason |
|---|---|---|
| **Streamlit** | ❌ Skip | Quick but ugly, not portfolio-worthy, limited layout control |
| **React SPA (Vite)** | ✓ Okay | Works but needs separate server for API routing |
| **Next.js (App Router)** | ✅ Best | API routes built-in (no separate Express needed), SSR, file-based routing, portfolio-grade, aligns with your existing skill set |
| **Vue / Svelte** | ❌ Skip | Unnecessary context switch, team familiarity lower |

### Why Tailwind CSS

- Utility-first → faster component building
- No stylesheet bloat
- Works perfectly with shadcn/ui component library
- You already know it (mentioned in RxGPT JD)

### Component library: shadcn/ui

- Copy-paste components (not a dependency), fully customizable
- Built on Radix UI primitives (accessible by default)
- Pairs perfectly with Tailwind
- Looks professional out of the box

### Backend: FastAPI (Python)

Keep the backend in Python to reuse all existing LangChain/ChromaDB code. FastAPI is:
- Async, fast, typed
- Auto-generates OpenAPI docs (free `/docs` endpoint)
- Easy to mount as a separate service or integrate with Next.js via API calls

---

## 3. New Project Structure

```
rag-knowledge-assistant/
│
├── backend/                          # Python FastAPI server
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI app entry point
│   │   ├── config.py                 # Settings, env vars, paths
│   │   │
│   │   ├── core/                     # Refactored RAG logic (from numbered scripts)
│   │   │   ├── __init__.py
│   │   │   ├── ingestion.py          # From: 1_ingestion_pipeline.py
│   │   │   ├── retrieval.py          # From: 2_, 9_, 10_, 11_ scripts
│   │   │   ├── generation.py         # From: 3_answer_generation.py
│   │   │   ├── chat.py               # From: 4_history_aware_generation.py
│   │   │   ├── chunking.py           # From: 5_, 6_, 7_ scripts
│   │   │   └── vector_store.py       # ChromaDB client wrapper
│   │   │
│   │   ├── api/                      # Route handlers
│   │   │   ├── __init__.py
│   │   │   ├── chat.py               # POST /api/chat  — Q&A with history
│   │   │   ├── documents.py          # POST /api/documents/upload, GET /api/documents
│   │   │   └── health.py             # GET /api/health
│   │   │
│   │   └── models/                   # Pydantic schemas
│   │       ├── __init__.py
│   │       ├── chat.py               # ChatRequest, ChatResponse, Message
│   │       └── documents.py          # DocumentInfo, UploadResponse
│   │
│   ├── db/                           # ChromaDB persisted storage
│   │   └── chroma_db/                # (auto-created on first run)
│   │
│   ├── docs/                         # Knowledge base documents
│   │   ├── Google.txt
│   │   ├── Microsoft.txt
│   │   ├── Nvidia.txt
│   │   ├── SpaceX.txt
│   │   ├── Tesla.txt
│   │   └── attention-is-all-you-need.pdf
│   │
│   ├── notebooks/                    # Move experimental notebooks here
│   │   ├── 8_multi_modal_rag.ipynb
│   │   ├── 12_hybrid_search.ipynb
│   │   └── 13_reranker.ipynb
│   │
│   ├── requirements.txt              # Keep existing (trim unused later)
│   ├── .env.example                  # Template: OPENAI_API_KEY=
│   └── README.md
│
├── frontend/                         # Next.js 14 App Router
│   ├── app/
│   │   ├── layout.tsx                # Root layout, font, theme provider
│   │   ├── page.tsx                  # Home → redirects to /chat
│   │   ├── chat/
│   │   │   └── page.tsx              # Main chat interface
│   │   └── documents/
│   │       └── page.tsx              # Document management / upload page
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components (auto-generated)
│   │   ├── chat/
│   │   │   ├── ChatWindow.tsx        # Main chat container
│   │   │   ├── MessageBubble.tsx     # User / AI message rendering
│   │   │   ├── SourceCard.tsx        # Shows retrieved docs as citations
│   │   │   ├── QueryInput.tsx        # Textarea + send button
│   │   │   └── TypingIndicator.tsx   # Streaming / loading state
│   │   └── documents/
│   │       ├── DocumentList.tsx      # List of ingested docs
│   │       └── UploadZone.tsx        # Drag-and-drop file uploader
│   │
│   ├── lib/
│   │   ├── api.ts                    # fetch wrappers for backend calls
│   │   └── utils.ts                  # cn(), formatDate(), truncate()
│   │
│   ├── hooks/
│   │   ├── useChat.ts                # Chat state, history, streaming
│   │   └── useDocuments.ts           # Document list + upload state
│   │
│   ├── types/
│   │   └── index.ts                  # Shared TypeScript interfaces
│   │
│   ├── public/                       # Static assets
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── package.json
│   └── .env.local                    # NEXT_PUBLIC_API_URL=http://localhost:8000
│
├── .gitignore
└── README.md                         # Root readme with setup for both services
```

---

## 4. Backend API Design

### Endpoints to build

```
GET  /api/health                      → { status: "ok", docs_count: N }

POST /api/chat
  Body:  { message: string, history: Message[], retrieval_mode: string }
  Returns: { answer: string, sources: Source[], query_used: string }

GET  /api/documents
  Returns: { documents: [{ name, size, chunks, uploaded_at }] }

POST /api/documents/upload
  Body:  multipart/form-data (file)
  Returns: { success: bool, chunks_created: int, doc_name: string }

DELETE /api/documents/:name
  Returns: { success: bool }
```

### Key backend logic to wire up

The `core/` modules are essentially **refactors of the existing scripts**:

- `ingestion.py` → extract `load_documents()`, `split_documents()`, `create_vector_store()` from `1_ingestion_pipeline.py`
- `chat.py` → extract `ask_question()` loop from `4_history_aware_generation.py`, make it stateless (history passed in request)
- `retrieval.py` → expose retrieval mode as a parameter (similarity / MMR / hybrid) from scripts `9`, `11`, `12`

---

## 5. Frontend UI Design

### Pages

#### `/chat` — Main Chat Interface

```
┌─────────────────────────────────────────────┐
│  🧠 RAG Knowledge Assistant        [Docs →] │
├────────────┬────────────────────────────────┤
│            │                                │
│  Sidebar   │   Chat Window                  │
│            │                                │
│  • Google  │   ┌──────────────────────┐     │
│  • NVIDIA  │   │ 👤 How does Tesla    │     │
│  • Tesla   │   │    make money?       │     │
│  • SpaceX  │   └──────────────────────┘     │
│  • MSFT    │                                │
│            │   ┌──────────────────────┐     │
│  ─────────│   │ 🤖 Tesla generates  │     │
│  Mode:     │   │    revenue through...│     │
│  ○ Basic   │   │                      │     │
│  ○ Hybrid  │   │  Sources:            │     │
│  ○ Rerank  │   │  [Tesla.txt #3] [..] │     │
│            │   └──────────────────────┘     │
│            │                                │
│            │   [  Ask anything...      ▶ ] │
└────────────┴────────────────────────────────┘
```

Key UI features:
- **Source cards** below each AI response — shows which document chunk was used, with excerpt preview
- **Retrieval mode switcher** — Basic / Hybrid / Reranked (toggles the backend mode)
- **Streaming responses** — text streams in token-by-token using fetch + ReadableStream
- **Chat history** — full conversation thread, persisted in React state (passed to backend each call)
- **New Chat button** — clears history

#### `/documents` — Knowledge Base Manager

```
┌─────────────────────────────────────────────┐
│  📂 Knowledge Base               [← Chat]   │
├─────────────────────────────────────────────┤
│  Drop files here or click to upload         │
│  ┌───────────────────────────────────────┐  │
│  │      📄  Drag .txt / .pdf here        │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  Ingested Documents                         │
│  ┌──────────┬──────────┬──────────┐         │
│  │ Google   │ 847 chunks│ [Delete]│         │
│  │ NVIDIA   │ 612 chunks│ [Delete]│         │
│  │ Tesla    │ 934 chunks│ [Delete]│         │
│  │ SpaceX   │ 721 chunks│ [Delete]│         │
│  │ Microsoft│ 698 chunks│ [Delete]│         │
│  └──────────┴──────────┴──────────┘         │
└─────────────────────────────────────────────┘
```

---

## 6. Implementation Phases

### Phase 1 — Backend Refactor (2–3 days)

1. Create `backend/` folder structure
2. Move and refactor scripts into `core/` modules (no logic changes, just proper functions)
3. Build `main.py` FastAPI app with the 4 endpoints
4. Add Pydantic models for request/response validation
5. Test all endpoints via `/docs` (FastAPI Swagger UI)
6. Move `docs/` and `db/` under `backend/`

**Deliverable:** `uvicorn app.main:app --reload` works, all endpoints respond correctly.

### Phase 2 — Frontend Scaffold (1–2 days)

1. `npx create-next-app@latest frontend --typescript --tailwind --app`
2. Install shadcn/ui: `npx shadcn-ui@latest init`
3. Add components: Button, Textarea, Card, Badge, Separator, ScrollArea
4. Set up `lib/api.ts` with typed fetch functions
5. Build layout with sidebar + main panel

**Deliverable:** Static UI renders correctly with mocked data.

### Phase 3 — Wire Up Chat (2–3 days)

1. Implement `useChat` hook — manages messages array, calls `POST /api/chat`
2. Build `ChatWindow`, `MessageBubble`, `QueryInput` components
3. Add `SourceCard` component to render retrieved document chunks
4. Add streaming support (fetch with `ReadableStream` + `getReader()`)
5. Add loading / typing indicator

**Deliverable:** Full chat loop works end-to-end.

### Phase 4 — Document Upload (1 day)

1. Build `UploadZone` with `react-dropzone`
2. Wire to `POST /api/documents/upload`
3. Show upload progress + chunk count on success
4. Build `DocumentList` connected to `GET /api/documents`

**Deliverable:** Can upload a new `.txt` / `.pdf` and immediately query it.

### Phase 5 — Polish (1–2 days)

1. Dark mode support (shadcn/ui + Tailwind `dark:` classes)
2. Mobile responsive layout
3. Error states (API down, no docs ingested, etc.)
4. README update with setup instructions for both services
5. `.env.example` files for both `backend/` and `frontend/`

---

## 7. Key Dependencies to Add

### Backend additions (to existing `requirements.txt`)
```
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-multipart==0.0.9       # file uploads
```

### Frontend `package.json`
```json
{
  "dependencies": {
    "next": "14.x",
    "react": "18.x",
    "react-dom": "18.x",
    "react-dropzone": "^14.0.0",
    "lucide-react": "^0.383.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^18.0.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.0.0"
  }
}
```
shadcn/ui installs its own deps (Radix, class-variance-authority, clsx, tailwind-merge).

---

## 8. Running the Project

```bash
# Terminal 1 — Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev        # runs on http://localhost:3000
```

`.env` in `backend/`:
```
OPENAI_API_KEY=sk-...
```

`.env.local` in `frontend/`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 9. What This Unlocks for Your Portfolio

By shipping this UI, the project transforms from **"13 numbered scripts"** into a **demonstrable AI product**:

- Shows full-stack ownership (Python backend + Next.js frontend)
- The source-citation UI is directly relevant to enterprise RAG (what RxGPT-type companies build)
- Retrieval mode switcher demonstrates you understand the underlying AI concepts, not just the UI layer
- File upload → ingest → chat loop is a complete product loop — something most candidates can't demo

---

*Plan version 1.0 — ready for implementation.*

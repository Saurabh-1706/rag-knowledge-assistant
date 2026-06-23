# RAG Knowledge Assistant

A production-grade, portfolio-ready Retrieval-Augmented Generation (RAG) assistant designed to search, synthesize, and answer questions based on your corporate knowledge base. 

This repository houses a unified application featuring a **FastAPI backend** (Python) and a **Next.js 14 App Router frontend** (TypeScript & Tailwind CSS).

---

## 🚀 Features

### Core RAG Engine (Phases 1 & 2)
- 📂 **Multi-Format Ingestion**: Ingest and process plain text (`.txt`) and PDF (`.pdf`) files.
- ✂️ **Advanced Chunking**: Split documents using Recursive Character splitting to preserve context.
- ⚡ **Multi-Mode Retrieval**:
  - **Vector Search (Basic)**: Standard semantic retrieval using OpenAI `text-embedding-3-small` and ChromaDB.
  - **Hybrid Search (BM25)**: Combines semantic vector similarity search with traditional BM25 keyword matching via LangChain's `EnsembleRetriever`.
  - **Reranked Search (Cohere)**: Enhances retrieval quality by scoring top candidate documents using `CohereRerank`.
  - **Multi-Query (RRF)**: Expands the query into 3 semantic variations using an LLM, retrieves chunks for each, and aggregates them using **Reciprocal Rank Fusion (RRF)**.
- 💬 **Streaming Responses**: Stream GPT-4o response tokens to the frontend in real time using Server-Sent Events (SSE).
- 🗑️ **Document Deletion**: Delete individual documents from disk and garbage-collect all associated chunks in the Chroma vector database.
- 🔗 **URL Web Scraping**: Enter a web page URL to scrape clean main content, chunk it, embed it, and ingest it into the knowledge base dynamically.
- 🛡️ **Answer Grounding Confidence Badge**: Prompt the LLM to self-assess the factual grounding of generated answers (0-100%) against retrieved contexts, displaying a color-coded badge with hoverable rationales.

### Production Features (Phases 3 & 4)
- 📊 **LLM-as-a-Judge Evaluation Dashboard**:
  - Auto-run evaluations over a standardized corporate QA dataset (10 pairs).
  - Calculate key metrics: **Faithfulness**, **Answer Relevancy**, **Context Precision**, and **Context Recall** using structured GPT-4o judges.
  - Custom responsive **SVG Radar Chart** plotting strategy performances.
  - Complete history logs and question-by-question metric breakdowns showing generated answers vs. ground truths.
- ⚖️ **Side-by-Side Comparison Workspace**:
  - Toggle compare mode in the chat UI to query and see context chunks retrieved by all 4 strategies (Vector, Hybrid, Rerank, Multi-Query) side-by-side.
- ⚙️ **Asynchronous Ingestion**:
  - Ingestion runs in FastAPI background tasks immediately returning a `job_id`.
  - Frontend dynamically polls the status endpoint (`processing`, `completed`, `failed`) and renders a loader with live chunk counts.
- 🐳 **Docker Compose Orchestration**:
  - Spin up the entire multi-container app, including persistent volumes for Chroma DB and document storage, with a single command.

---

## 🏗️ Repository Architecture

```text
rag-knowledge-assistant/
│
├── backend/                       # FastAPI (Python) server
│   ├── app/
│   │   ├── api/                   # API routes and Pydantic schemas
│   │   ├── core/                  # Modular RAG pipelines, chat, and evaluator logic
│   │   ├── eval/                  # QA test datasets and historical runs
│   │   ├── config.py              # Configuration & env management
│   │   └── main.py                # FastAPI entry point & CORS configuration
│   ├── db/                        # Persisted ChromaDB storage directory (Volume mount)
│   ├── docs/                      # Server-side physical document storage
│   ├── Dockerfile                 # Backend container configuration
│   ├── requirements.txt           # Backend python dependencies
│   └── verify_phase3_4.py         # End-to-end API verification suite
│
├── frontend/                      # Next.js 14 (TypeScript & Tailwind) client
│   ├── app/                       # Page routes (/chat, /documents, /eval)
│   ├── components/                # Reusable UI elements (Sidebar)
│   ├── lib/                       # API request client module
│   ├── Dockerfile                 # Frontend Next.js production build configuration
│   └── package.json               # NPM packages and scripts
│
├── docker-compose.yml             # Docker services orchestration
└── README.md                      # Project documentation (this file)
```

---

## 🐳 Docker Compose Quickstart (Recommended)

Run the entire RAG pipeline, including database persistence and frontend UI, with a single command:

1. Clone the repository and create a `.env` in the root:
   ```env
   OPENAI_API_KEY=your_openai_key
   COHERE_API_KEY=your_cohere_key
   ```
2. Start the services:
   ```bash
   docker compose up --build
   ```
3. Open your browser and navigate to [http://localhost:3000](http://localhost:3000). The frontend will communicate automatically with the backend container on port `8002`.

---

## 🛠️ Manual Development Setup

### 1. Run the Backend (FastAPI)
Create a `.env` file in the `backend/` directory with your API keys.
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server (running on port 8002 to avoid conflicts)
python -m uvicorn app.main:app --host 127.0.0.1 --port 8002 --reload
```
Interactive Swagger docs will be available at [http://localhost:8002/docs](http://localhost:8002/docs).

### 2. Run the Frontend (Next.js)
```bash
cd frontend

# Install package dependencies
npm install

# Start the Next.js development server on port 3001
npx next dev -p 3001
```
Open [http://localhost:3001](http://localhost:3001) in your browser.

---

## 🔍 Retrieval Strategies Explained

### 1. Vector Search
Uses cosine similarity in embedding space to fetch the nearest neighbors. It excels at matching semantic concepts and intent, but can miss exact keyword matches.

### 2. Hybrid Search
Combines Vector Search (weight: 0.7) and BM25 Sparse Search (weight: 0.3) using Reciprocal Rank Fusion (RRF) inside a LangChain `EnsembleRetriever`. It provides excellent performance for both conceptual terms and exact keyword matches.

### 3. Cohere Reranking
Retrieves a larger set of candidates (e.g., $k \times 2$) using the Hybrid Search retriever, then runs them through the Cohere `rerank-english-v3.0` model. The model calculates a precise relevance score between the query and each chunk, ensuring the most contextually relevant information is placed directly in the prompt window.

### 4. Multi-Query Expansion (RRF)
Uses the LLM to rewrite the user's query into 3 distinct semantic variations. Retrieves chunks for all variations and runs Reciprocal Rank Fusion (RRF) to score and prioritize chunks. This resolves issues of vocabulary mismatch.

---

## 🧪 Running Verifications

We include an automated API verification suite for both core RAG actions and new features:

```bash
cd backend
python verify_phase3_4.py
```
This script tests:
1. **Asynchronous URL Scraping & Ingestion**: Verifies that the endpoint returns a `job_id`, polls the job status, and tracks chunks successfully.
2. **Parallel Mode Comparison**: Verifies the `POST /api/compare` parallel chunks fetch endpoint.
3. **LLM-as-a-judge Pipeline**: Automatically runs evaluations over the 10 QA pairs for "vector" mode, asserts averages are logged, and checks the detailed run getter endpoint.

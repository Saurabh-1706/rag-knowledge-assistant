# RAG Knowledge Assistant

A production-grade, full-stack Retrieval-Augmented Generation (RAG) assistant designed to search, synthesize, and answer questions based on your corporate knowledge base. 

This repository restructures isolated RAG scripts into a unified application featuring a **FastAPI backend** (Python) and a **Next.js 14 App Router frontend** (TypeScript & Tailwind CSS).

---

## 🚀 Features

- 📂 **Multi-Format Ingestion**: Ingest and process plain text (`.txt`) and PDF (`.pdf`) files dynamically.
- ✂️ **Advanced Chunking**: Split documents using Recursive Character splitting to preserve context.
- ⚡ **Multi-Mode Retrieval**:
  - **Vector Search (Basic)**: Standard semantic retrieval using OpenAI `text-embedding-3-small` and ChromaDB.
  - **Hybrid Search (BM25)**: Combines semantic vector similarity search with traditional BM25 keyword matching via LangChain's `EnsembleRetriever`.
  - **Reranked Search (Cohere)**: Enhances retrieval quality by scoring top candidate documents using `CohereRerank` (with automatic fail-safe fallback).
- 💬 **History-Aware Standalone Query Rewriting**: Evaluates conversation history and reformulates subsequent user follow-ups into standalone, searchable queries.
- 🎨 **Premium UI/UX Dashboard**:
  - Clean and responsive dark mode design.
  - Citations cards directly linked to AI responses, rendering chunk previews.
  - Interactive Mode Switcher to toggle search algorithms on the fly.
  - Real-time sidebar status monitor checking backend connection state and total ingested chunks.

---

## 🏗️ Repository Architecture

```text
rag-knowledge-assistant/
│
├── backend/                       # FastAPI (Python) server
│   ├── app/
│   │   ├── api/                   # API routes and Pydantic models
│   │   ├── core/                  # Modular RAG pipelines (ingestion, retrieval, chat)
│   │   ├── config.py              # Configuration & env management
│   │   └── main.py                # FastAPI entry point & CORS configuration
│   ├── db/                        # Persisted ChromaDB storage directory
│   ├── docs/                      # Server-side physical document storage
│   ├── notebooks/                 # Isolated Jupyter Notebooks for RAG research
│   └── requirements.txt           # Backend python dependencies
│
├── frontend/                      # Next.js 14 (TypeScript & Tailwind) client
│   ├── app/                       # Page layouts, Chat, and Document routes
│   ├── components/                # Reusable UI elements (Sidebar)
│   ├── lib/                       # API request client module
│   └── package.json               # NPM packages and scripts
│
└── README.md                      # Project documentation (this file)
```

---

## 🛠️ Getting Started

### Prerequisites

- **Python**: v3.10+
- **Node.js**: v18+
- **API Keys**: OpenAI API Key (required), Cohere API Key (optional, for reranking)

### 1. Set Up Environment Variables

Create a `.env` file in the root directory (or in `backend/`):

```env
OPENAI_API_KEY=your_openai_api_key_here
COHERE_API_KEY=your_cohere_api_key_here  # Optional: standard search fallbacks apply if omitted
```

### 2. Run the Backend (FastAPI)

```bash
# Navigate to backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The API will start running at [http://localhost:8000](http://localhost:8000). You can access the interactive Swagger documentation at [http://localhost:8000/docs](http://localhost:8000/docs).

### 3. Run the Frontend (Next.js)

```bash
# Navigate to frontend directory
cd frontend

# Install package dependencies
npm install

# Start the Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to interact with the dashboard.

---

## 🔍 Retrieval Strategies Explained

### 1. Vector Search
Uses cosine similarity in embedding space to fetch the top-$k$ nearest neighbors to the query representation. It excels at matching semantic concepts, synonyms, and intent, but can miss specific serial numbers, product names, or keyword matches.

### 2. Hybrid Search
Combines Vector Search (weight: 0.7) and BM25 Sparse Search (weight: 0.3) using Reciprocal Rank Fusion (RRF) inside a LangChain `EnsembleRetriever`. BM25 matches exact keywords and terminology while Vector Search handles the conceptual meaning, giving you the best of both retrieval paradigms.

### 3. Cohere Reranking
Retrieves a larger set of candidates (e.g., $k \times 2$) using the Hybrid Search retriever, then runs those candidates through the Cohere `rerank-english-v3.0` model. The model calculates a precise relevance score between the query and each chunk, outputting only the top $k$ items. This ensures the most contextually relevant information is placed directly in the prompt window for the generation model.

from typing import List, Tuple, Optional
from langchain_chroma import Chroma
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever
from langchain_cohere import CohereRerank
from langchain_core.documents import Document
from app import config
from app.core.vector_store import get_vector_store

def get_all_documents(db: Chroma) -> List[Document]:
    """Retrieve all stored documents in Chroma DB"""
    try:
        data = db.get()
        if not data or not data.get("documents"):
            return []
        
        docs = []
        for doc_text, meta in zip(data["documents"], data["metadatas"]):
            # Normalize source in metadata
            source = meta.get("source", "unknown") if meta else "unknown"
            docs.append(Document(page_content=doc_text, metadata={"source": source}))
        return docs
    except Exception as e:
        print(f"Error fetching documents from Chroma: {e}")
        return []

def retrieve_documents(query: str, mode: str = "vector", k: int = 5) -> Tuple[List[Document], Optional[str]]:
    """
    Retrieve documents matching query.
    Modes: 'vector', 'hybrid', 'rerank'
    Returns: List of Documents and an optional notice (if fallback occurred).
    """
    db = get_vector_store()
    all_docs = get_all_documents(db)
    
    if not all_docs:
        return [], "No documents found in the database. Please upload documents first."
        
    notice = None
    
    # 1. Base Vector Retriever
    vector_retriever = db.as_retriever(search_kwargs={"k": k})
    
    if mode == "vector":
        try:
            docs = vector_retriever.invoke(query)
            return docs, notice
        except Exception as e:
            return [], f"Vector retrieval error: {str(e)}"
            
    # 2. Base Hybrid Retriever
    try:
        # Load BM25 retriever dynamically from all ingested documents
        bm25_retriever = BM25Retriever.from_documents(all_docs)
        bm25_retriever.k = k
        
        hybrid_retriever = EnsembleRetriever(
            retrievers=[vector_retriever, bm25_retriever],
            weights=[0.7, 0.3]
        )
        retrieved_docs = hybrid_retriever.invoke(query)
    except Exception as e:
        print(f"Hybrid retrieval error: {e}. Falling back to Vector.")
        retrieved_docs = vector_retriever.invoke(query)
        notice = f"Hybrid search failed ({str(e)}). Fell back to Vector search."
        
    if mode == "hybrid":
        return retrieved_docs, notice
        
    # 3. Rerank Retriever
    if mode == "rerank":
        if not config.COHERE_API_KEY:
            notice = "Cohere Rerank bypassed: COHERE_API_KEY is not configured in .env. Falling back to Hybrid search."
            return retrieved_docs, notice
            
        try:
            # Retrieve slightly more documents for reranking to choose from
            rerank_k = max(k * 2, 10)
            
            # Re-initialize hybrid retriever with larger limit
            bm25_retriever_large = BM25Retriever.from_documents(all_docs)
            bm25_retriever_large.k = rerank_k
            
            vector_retriever_large = db.as_retriever(search_kwargs={"k": rerank_k})
            
            hybrid_retriever_large = EnsembleRetriever(
                retrievers=[vector_retriever_large, bm25_retriever_large],
                weights=[0.7, 0.3]
            )
            
            initial_docs = hybrid_retriever_large.invoke(query)
            
            # Apply Cohere Rerank
            reranker = CohereRerank(
                cohere_api_key=config.COHERE_API_KEY,
                model="rerank-english-v3.0",
                top_n=k
            )
            reranked_docs = reranker.compress_documents(initial_docs, query)
            return reranked_docs, notice
        except Exception as e:
            print(f"Reranking error: {e}. Falling back to Hybrid.")
            notice = f"Reranking failed ({str(e)}). Fell back to Hybrid search."
            return retrieved_docs, notice
            
    return retrieved_docs, notice

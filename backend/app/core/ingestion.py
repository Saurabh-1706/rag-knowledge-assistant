import os
import tempfile
from typing import List
from langchain_core.documents import Document
from langchain_community.document_loaders import PyPDFLoader
from app.core.vector_store import get_vector_store
from app.core.chunking import split_text_into_chunks

def load_pdf_text(file_bytes: bytes, file_name: str) -> List[Document]:
    """Write PDF bytes to a temp file and load it using PyPDFLoader"""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temp_file:
        temp_file.write(file_bytes)
        temp_path = temp_file.name

    try:
        loader = PyPDFLoader(temp_path)
        docs = loader.load()
        # Override source metadata to the original file name rather than the temp path
        for doc in docs:
            doc.metadata["source"] = file_name
        return docs
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

def ingest_document(file_name: str, file_content: bytes) -> int:
    """Ingest a document (txt or pdf) into the Chroma vector store. Returns chunk count."""
    vector_store = get_vector_store()
    
    documents = []
    if file_name.lower().endswith(".pdf"):
        documents = load_pdf_text(file_content, file_name)
    else:
        # Assume plain text (.txt, .md, etc.)
        text = file_content.decode("utf-8", errors="ignore")
        documents = [Document(page_content=text, metadata={"source": file_name})]
    
    # Split documents into chunks
    chunks = []
    for doc in documents:
        # We split text contents
        split_texts = split_text_into_chunks(doc.page_content, strategy="recursive")
        for chunk_text in split_texts:
            chunks.append(Document(page_content=chunk_text, metadata={"source": doc.metadata.get("source", file_name)}))
            
    if chunks:
        vector_store.add_documents(chunks)
        
    return len(chunks)

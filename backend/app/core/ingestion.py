import os
import re
import tempfile
from typing import List, Tuple
import httpx
from bs4 import BeautifulSoup
from langchain_core.documents import Document
from langchain_community.document_loaders import PyPDFLoader
from app import config
from app.core.vector_store import get_vector_store
from app.core.chunking import split_text_into_chunks

def url_to_filename(url: str) -> str:
    """Convert URL into a clean, safe filename"""
    # Remove protocol and www
    name = re.sub(r"^https?://(www\.)?", "", url)
    # Replace non-alphanumeric characters with underscores
    name = re.sub(r"[^a-zA-Z0-9\-_.]", "_", name)
    # Limit length
    name = name[:60]
    return f"url_{name}.txt"

def scrape_url_text(url: str) -> Tuple[str, str]:
    """Fetch URL and extract clean text content. Returns (title, text)."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    response = httpx.get(url, headers=headers, follow_redirects=True, timeout=15.0)
    response.raise_for_status()
    
    soup = BeautifulSoup(response.text, "html.parser")
    
    # Remove unwanted scripts and tags
    for element in soup(["script", "style", "meta", "noscript", "header", "footer", "nav", "aside"]):
        element.extract()
        
    title = soup.title.string.strip() if soup.title and soup.title.string else url
    
    chunks = []
    # Collect readable texts from standard text blocks
    for elem in soup.find_all(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li"]):
        text = elem.get_text().strip()
        if text:
            chunks.append(text)
            
    return title, "\n\n".join(chunks)

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

def ingest_from_url(url: str) -> Tuple[str, int]:
    """Scrape web page text, save to docs directory as a text file, and ingest into Chroma DB"""
    title, text = scrape_url_text(url)
    
    filename = url_to_filename(url)
    
    # Save the file physically in the docs directory
    docs_dir = config.DOCS_DIR
    os.makedirs(docs_dir, exist_ok=True)
    filepath = os.path.join(docs_dir, filename)
    
    content_bytes = text.encode("utf-8")
    with open(filepath, "wb") as f:
        f.write(content_bytes)
        
    # Ingest document
    chunks_created = ingest_document(filename, content_bytes)
    return filename, chunks_created


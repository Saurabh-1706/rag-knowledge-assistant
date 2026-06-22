from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_experimental.text_splitter import SemanticChunker
from app.core.vector_store import get_embeddings

def split_text_into_chunks(text: str, strategy: str = "recursive", chunk_size: int = 1000, chunk_overlap: int = 200):
    """
    Split text into chunks using the specified strategy.
    Strategies: 'recursive', 'semantic'
    """
    if strategy == "semantic":
        embeddings = get_embeddings()
        semantic_splitter = SemanticChunker(
            embeddings=embeddings,
            breakpoint_threshold_type="percentile",
            breakpoint_threshold_amount=70
        )
        # Semantic chunker expects documents or list of strings
        chunks = semantic_splitter.split_text(text)
        return chunks
    else:
        # Default: recursive
        recursive_splitter = RecursiveCharacterTextSplitter(
            separators=["\n\n", "\n", ". ", " ", ""],
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
        return recursive_splitter.split_text(text)

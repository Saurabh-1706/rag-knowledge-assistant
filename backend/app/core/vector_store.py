from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from app import config

def get_embeddings():
    return OpenAIEmbeddings(
        model="text-embedding-3-small",
        api_key=config.OPENAI_API_KEY
    )

def get_vector_store():
    embeddings = get_embeddings()
    return Chroma(
        persist_directory=config.PERSIST_DIR,
        embedding_function=embeddings,
        collection_metadata={"hnsw:space": "cosine"}
    )

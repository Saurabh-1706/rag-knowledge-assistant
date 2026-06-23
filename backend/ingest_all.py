import os
import sys
from pathlib import Path

# Add backend root to path
sys.path.append(str(Path(__file__).resolve().parent))

from app.core.ingestion import ingest_document
from app.core.vector_store import get_vector_store
from app import config

def main():
    print("=== Ingesting all documents from docs/ directory ===")
    docs_dir = config.DOCS_DIR
    if not os.path.exists(docs_dir):
        print(f"Docs directory '{docs_dir}' does not exist.")
        return
        
    db = get_vector_store()
    
    # List files
    files = [f for f in os.listdir(docs_dir) if os.path.isfile(os.path.join(docs_dir, f))]
    print(f"Found {len(files)} files to process: {files}")
    
    for filename in files:
        filepath = os.path.join(docs_dir, filename)
        
        # Check if already ingested (has chunks)
        # We search matching source metadatas
        has_chunks = False
        variants = [filename, f"docs/{filename}", os.path.join("docs", filename), f"backend/docs/{filename}"]
        for variant in variants:
            try:
                data = db.get(where={"source": variant})
                if data and data.get("ids"):
                    has_chunks = True
                    print(f"File {filename} is already ingested ({len(data['ids'])} chunks).")
                    break
            except Exception:
                pass
                
        if has_chunks:
            continue
            
        print(f"Ingesting {filename}...")
        try:
            with open(filepath, "rb") as f:
                content = f.read()
            chunks = ingest_document(filename, content)
            print(f"Successfully ingested {filename} ({chunks} chunks created).")
        except Exception as e:
            print(f"Failed to ingest {filename}: {e}")
            
    print("=== Ingestion complete ===")

if __name__ == "__main__":
    main()

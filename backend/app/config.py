import os
from pathlib import Path
from dotenv import load_dotenv

# Get the directory where config.py resides and find the backend root
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables
load_dotenv(dotenv_path=BASE_DIR / ".env")
load_dotenv(dotenv_path=BASE_DIR.parent / ".env")  # Fallback to repository root .env

# Paths
PERSIST_DIR = os.getenv("PERSIST_DIRECTORY", str(BASE_DIR / "db" / "chroma_db"))
DOCS_DIR = os.getenv("DOCS_DIRECTORY", str(BASE_DIR / "docs"))

# Keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
COHERE_API_KEY = os.getenv("COHERE_API_KEY")

# Ensure directories exist
Path(DOCS_DIR).mkdir(parents=True, exist_ok=True)
Path(PERSIST_DIR).parent.mkdir(parents=True, exist_ok=True)

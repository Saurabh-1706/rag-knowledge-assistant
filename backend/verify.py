import requests
import json
import sys

BASE_URL = "http://127.0.0.1:8002"

def test_health():
    print("\n--- Testing Health Check ---")
    res = requests.get(f"{BASE_URL}/api/health")
    print(f"Status Code: {res.status_code}")
    print(f"Response: {res.json()}")
    assert res.status_code == 200, "Health check failed"

def test_url_ingestion():
    print("\n--- Testing URL Ingestion ---")
    url = "https://example.com/"
    payload = {"url": url}
    res = requests.post(f"{BASE_URL}/api/documents/url", json=payload)
    print(f"Status Code: {res.status_code}")
    print(f"Response: {res.json()}")
    assert res.status_code == 200, "URL Ingestion failed"
    data = res.json()
    assert data["success"] == True
    assert data["chunks_created"] > 0
    return data["doc_name"]

def test_list_documents(expected_doc):
    print("\n--- Testing List Documents ---")
    res = requests.get(f"{BASE_URL}/api/documents")
    print(f"Status Code: {res.status_code}")
    docs = res.json()
    print(f"Found {len(docs)} documents.")
    found = False
    for doc in docs:
        if doc["name"] == expected_doc:
            print(f"Verified: Found expected document '{expected_doc}' with {doc['chunks']} chunks.")
            found = True
            break
    assert found, f"Expected document '{expected_doc}' not found in listed documents"

def test_chat_stream():
    print("\n--- Testing Chat Streaming & Confidence ---")
    payload = {
        "message": "What is Example Domain and what is it used for?",
        "history": [],
        "retrieval_mode": "multiquery"
    }
    
    res = requests.post(f"{BASE_URL}/api/chat/stream", json=payload, stream=True)
    print(f"Status Code: {res.status_code}")
    assert res.status_code == 200, "Chat stream failed"
    
    has_metadata = False
    has_tokens = False
    has_confidence = False
    full_text = ""
    
    for line in res.iter_lines():
        if line:
            decoded = line.decode('utf-8').strip()
            if decoded.startswith("data: "):
                data_str = decoded[6:]
                if data_str == "[DONE]":
                    print("Received [DONE] signal.")
                    break
                
                try:
                    data = json.loads(data_str)
                    dtype = data.get("type")
                    if dtype == "metadata":
                        has_metadata = True
                        print(f"Metadata received: Standalone query used: '{data.get('query_used')}'")
                        print(f"Sources: {[s['source'] for s in data.get('sources', [])]}")
                    elif dtype == "token":
                        has_tokens = True
                        token = data.get("content", "")
                        full_text += token
                        # print(token, end="", flush=True) # Un-comment to print streamed answer
                    elif dtype == "confidence":
                        has_confidence = True
                        confidence = data.get("confidence", {})
                        print(f"\nConfidence Evaluation received: Score = {confidence.get('score')}%, Rationale = '{confidence.get('rationale')}'")
                except Exception as e:
                    print(f"\nError parsing line '{decoded}': {e}")
                    
    print(f"Full answer generated: '{full_text[:100]}...'")
    assert has_metadata, "Did not receive metadata in stream"
    assert has_tokens, "Did not receive tokens in stream"
    assert has_confidence, "Did not receive confidence score in stream"
    print("Chat streaming and grounding evaluation verified successfully!")

def test_delete_document(doc_name):
    print(f"\n--- Testing Delete Document for '{doc_name}' ---")
    res = requests.delete(f"{BASE_URL}/api/documents/{doc_name}")
    print(f"Status Code: {res.status_code}")
    print(f"Response: {res.json()}")
    assert res.status_code == 200, "Delete document failed"
    assert res.json()["success"] == True
    
    # Re-verify document list
    res_list = requests.get(f"{BASE_URL}/api/documents")
    docs = res_list.json()
    assert not any(d["name"] == doc_name for d in docs), "Document was not removed from list after deletion"
    print("Document deletion successfully verified!")

if __name__ == "__main__":
    try:
        test_health()
        doc_name = test_url_ingestion()
        test_list_documents(doc_name)
        test_chat_stream()
        test_delete_document(doc_name)
        print("\n=== ALL TESTS PASSED SUCCESSFULLY! ===")
    except Exception as e:
        print(f"\n=== TEST FAILED ===\n{e}")
        sys.exit(1)

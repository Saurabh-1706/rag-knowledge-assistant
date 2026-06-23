import requests
import json
import time
import sys

BASE_URL = "http://127.0.0.1:8002"

def test_async_url_ingestion():
    print("\n--- Testing Async URL Ingestion (Phase 4) ---")
    url = "https://example.com/"
    payload = {"url": url}
    res = requests.post(f"{BASE_URL}/api/documents/url", json=payload)
    print(f"Post Response Code: {res.status_code}")
    print(f"Post Response Body: {res.json()}")
    assert res.status_code == 200, "URL Ingestion trigger failed"
    
    data = res.json()
    job_id = data.get("job_id")
    status = data.get("status")
    doc_name = data.get("doc_name")
    assert job_id is not None, "Job ID not returned"
    assert status == "processing", "Incorrect initial status"
    
    print(f"Polled job '{job_id}' started. Polling status...")
    completed = False
    for i in range(10):
        time.sleep(2)
        status_res = requests.get(f"{BASE_URL}/api/documents/status/{job_id}")
        status_data = status_res.json()
        print(f"Poll {i+1}: Status = {status_data['status']}, Chunks = {status_data['chunks_created']}, Error = {status_data['error']}")
        
        if status_data["status"] == "completed":
            completed = True
            print(f"Ingestion job completed successfully in background!")
            break
        elif status_data["status"] == "failed":
            print(f"Ingestion job failed in background: {status_data['error']}")
            break
            
    assert completed, "Background ingestion job did not complete"
    return doc_name

def test_parallel_mode_comparison():
    print("\n--- Testing Parallel Mode Comparison (Phase 3) ---")
    payload = {
        "message": "NVIDIA founders and startup history",
        "history": [],
        "retrieval_mode": "vector"
    }
    
    res = requests.post(f"{BASE_URL}/api/compare", json=payload)
    print(f"Response Code: {res.status_code}")
    assert res.status_code == 200, "Compare endpoint failed"
    
    data = res.json()
    modes = ["vector", "hybrid", "rerank", "multiquery"]
    for m in modes:
        assert m in data, f"Retrieval mode '{m}' missing in comparison results"
        chunks = data[m].get("chunks", [])
        print(f"Mode '{m}': retrieved {len(chunks)} chunks.")
    print("Parallel mode comparison verified successfully!")

def test_evaluation_pipeline():
    print("\n--- Testing Evaluation Run & History (Phase 3) ---")
    
    # Trigger a run on 2 items to test the judging quickly
    # Wait, we can test history first to see past runs, or just trigger a short run.
    # Note: run_evaluation_pipeline runs over the entire dataset.json (10 items).
    # Since gpt-4o evaluates 10 items, it can take 20-30 seconds.
    # Let's run a test for vector mode.
    print("Triggering evaluation for 'vector' mode... (This runs LLM-as-a-judge over the 10 QA pairs)")
    payload = {"retrieval_mode": "vector"}
    start_time = time.time()
    res = requests.post(f"{BASE_URL}/api/eval/run", json=payload)
    duration = time.time() - start_time
    print(f"Response Code: {res.status_code} (took {duration:.1f}s)")
    assert res.status_code == 200, "Evaluation run failed"
    
    data = res.json()
    print("Evaluation Averages:")
    print(json.dumps(data.get("averages"), indent=2))
    assert "averages" in data, "Average scores missing"
    assert len(data.get("results", [])) == 10, "Should have evaluated all 10 items"
    
    # Check history list
    print("\nChecking evaluation history logs...")
    hist_res = requests.get(f"{BASE_URL}/api/eval/history")
    print(f"History Response Code: {hist_res.status_code}")
    assert hist_res.status_code == 200, "History fetch failed"
    history = hist_res.json()
    print(f"Found {len(history)} past runs in logs.")
    assert len(history) > 0, "No runs logged in history"
    latest_run = history[0]
    print(f"Latest run in history matches: Mode = {latest_run['retrieval_mode']}, Timestamp = {latest_run['timestamp']}")
    
    # Check detail retrieval endpoint
    filename = latest_run["filename"]
    detail_res = requests.get(f"{BASE_URL}/api/eval/run/{filename}")
    print(f"Detail Response Code: {detail_res.status_code}")
    assert detail_res.status_code == 200, "Detailed run report fetch failed"
    detail_data = detail_res.json()
    assert detail_data["timestamp"] == latest_run["timestamp"], "Run details mismatch"
    print("Evaluation pipeline and detail getter verified successfully!")

def cleanup_doc(doc_name):
    print(f"\n--- Cleaning up document '{doc_name}' ---")
    res = requests.delete(f"{BASE_URL}/api/documents/{doc_name}")
    print(f"Delete Response: {res.json()}")
    assert res.status_code == 200, "Delete failed"

if __name__ == "__main__":
    try:
        doc_name = test_async_url_ingestion()
        test_parallel_mode_comparison()
        test_evaluation_pipeline()
        cleanup_doc(doc_name)
        print("\n=== PHASE 3 & 4 TESTS PASSED SUCCESSFULLY! ===")
    except Exception as e:
        print(f"\n=== TEST FAILED ===\n{e}")
        sys.exit(1)

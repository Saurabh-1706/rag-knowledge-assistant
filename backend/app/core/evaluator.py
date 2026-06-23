import os
import json
from datetime import datetime
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from app import config
from app.core.retrieval import retrieve_documents
from app.core.chat import generate_chat_response

# Define structured schemas for LLM-as-a-judge

class FaithfulnessEval(BaseModel):
    statements: List[str] = Field(description="Factual claims/statements made in the generated answer.")
    supported: List[bool] = Field(description="For each statement, True if it is fully supported by the provided context, False otherwise.")

class AnswerRelevancyEval(BaseModel):
    score: int = Field(description="Relevancy score from 0 to 100 showing how directly the answer addresses the question.")
    rationale: str = Field(description="A short one-sentence rationale for the score.")

class ContextPrecisionEval(BaseModel):
    relevant_chunks: List[bool] = Field(description="For each retrieved chunk in order, True if it contains information relevant to answering the query, False otherwise.")

class ContextRecallEval(BaseModel):
    ground_truth_statements: List[str] = Field(description="Key factual statements contained in the ground truth answer.")
    recalled: List[bool] = Field(description="For each ground truth statement, True if it is present or can be inferred from the retrieved chunks, False otherwise.")

def evaluate_run_item(
    query: str, 
    answer: str, 
    ground_truth: str, 
    docs: List[Any], 
    model: ChatOpenAI
) -> Dict[str, Any]:
    """Evaluate a single Q&A run against RAG metrics using LLM-as-a-judge"""
    
    # 1. Prepare context strings
    context_str = "\n\n".join([f"[Chunk {i+1}]: {doc.page_content}" for i, doc in enumerate(docs)])
    
    # Defaults
    faithfulness_score = 100
    relevancy_score = 100
    precision_score = 100
    recall_score = 100
    
    details = {}
    
    # -- A. Faithfulness --
    try:
        llm_faithfulness = model.with_structured_output(FaithfulnessEval)
        prompt = f"""Evaluate whether the generated answer is faithful to the retrieved context. 
        List all factual claims in the answer and mark True if supported by the context, False if not.
        
        Retrieved Context:
        {context_str}
        
        Generated Answer:
        {answer}"""
        
        res = llm_faithfulness.invoke(prompt)
        if res.supported:
            faithfulness_score = int((sum(res.supported) / len(res.supported)) * 100)
        details["faithfulness"] = {"statements": res.statements, "supported": res.supported}
    except Exception as e:
        print(f"Error evaluating faithfulness: {e}")
        faithfulness_score = 0
        details["faithfulness"] = {"error": str(e)}

    # -- B. Answer Relevancy --
    try:
        llm_relevancy = model.with_structured_output(AnswerRelevancyEval)
        prompt = f"""Evaluate how relevant the generated answer is to the user's query.
        Rate from 0 to 100 based on how directly it answers the question without fluff or dodging.
        
        User Query: {query}
        Generated Answer: {answer}"""
        
        res = llm_relevancy.invoke(prompt)
        relevancy_score = res.score
        details["relevancy"] = {"rationale": res.rationale}
    except Exception as e:
        print(f"Error evaluating relevancy: {e}")
        relevancy_score = 0
        details["relevancy"] = {"error": str(e)}

    # -- C. Context Precision --
    try:
        llm_precision = model.with_structured_output(ContextPrecisionEval)
        chunks_formatted = "\n".join([f"Chunk {i+1}: {doc.page_content}" for i, doc in enumerate(docs)])
        prompt = f"""Evaluate the retrieved document chunks for the user query.
        For each chunk, determine if it is relevant (True) or irrelevant (False) to answering the query.
        
        User Query: {query}
        Retrieved Chunks:
        {chunks_formatted}"""
        
        res = llm_precision.invoke(prompt)
        if res.relevant_chunks:
            precision_score = int((sum(res.relevant_chunks) / len(res.relevant_chunks)) * 100)
        details["precision"] = {"relevant_chunks": res.relevant_chunks}
    except Exception as e:
        print(f"Error evaluating precision: {e}")
        precision_score = 0
        details["precision"] = {"error": str(e)}

    # -- D. Context Recall --
    try:
        llm_recall = model.with_structured_output(ContextRecallEval)
        prompt = f"""Evaluate context recall. Extract key statements from the ground truth answer,
        and mark True if they are found in the retrieved context chunks, False if missing.
        
        Ground Truth Answer: {ground_truth}
        Retrieved Context Chunks:
        {context_str}"""
        
        res = llm_recall.invoke(prompt)
        if res.recalled:
            recall_score = int((sum(res.recalled) / len(res.recalled)) * 100)
        details["recall"] = {"statements": res.ground_truth_statements, "recalled": res.recalled}
    except Exception as e:
        print(f"Error evaluating recall: {e}")
        recall_score = 0
        details["recall"] = {"error": str(e)}

    return {
        "metrics": {
            "faithfulness": faithfulness_score,
            "relevancy": relevancy_score,
            "precision": precision_score,
            "recall": recall_score
        },
        "details": details
    }

def run_evaluation_pipeline(retrieval_mode: str) -> Dict[str, Any]:
    """Run full evaluation pipeline over dataset.json for a chosen retrieval mode"""
    # 1. Load Dataset
    base_dir = config.BASE_DIR
    dataset_path = base_dir / "app" / "eval" / "dataset.json"
    
    if not os.path.exists(dataset_path):
        raise FileNotFoundError(f"Evaluation dataset not found at {dataset_path}")
        
    with open(dataset_path, "r", encoding="utf-8") as f:
        dataset = json.load(f)
        
    model = ChatOpenAI(
        model="gpt-4o",
        api_key=config.OPENAI_API_KEY,
        temperature=0
    )
    
    results = []
    
    # 2. Iterate and evaluate
    for i, item in enumerate(dataset):
        query = item["question"]
        ground_truth = item["ground_truth"]
        
        print(f"Evaluating item {i+1}/{len(dataset)}: {query[:40]}...")
        
        # Run retrieval
        docs, notice = retrieve_documents(query, mode=retrieval_mode, k=5)
        
        # Run response generator
        response = generate_chat_response(query, [], retrieval_mode=retrieval_mode, k=5)
        answer = response["answer"]
        
        # Evaluate metrics
        eval_res = evaluate_run_item(query, answer, ground_truth, docs, model)
        
        results.append({
            "question": query,
            "ground_truth": ground_truth,
            "answer": answer,
            "sources": [doc.metadata.get("source", "unknown") for doc in docs],
            "metrics": eval_res["metrics"],
            "details": eval_res["details"]
        })
        
    # 3. Compute Averages
    avg_faithfulness = sum(r["metrics"]["faithfulness"] for r in results) / len(results)
    avg_relevancy = sum(r["metrics"]["relevancy"] for r in results) / len(results)
    avg_precision = sum(r["metrics"]["precision"] for r in results) / len(results)
    avg_recall = sum(r["metrics"]["recall"] for r in results) / len(results)
    
    summary = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "retrieval_mode": retrieval_mode,
        "averages": {
            "faithfulness": round(avg_faithfulness, 1),
            "relevancy": round(avg_relevancy, 1),
            "precision": round(avg_precision, 1),
            "recall": round(avg_recall, 1)
        },
        "items_count": len(results),
        "results": results
    }
    
    # 4. Save Run
    runs_dir = base_dir / "app" / "eval" / "runs"
    os.makedirs(runs_dir, exist_ok=True)
    
    timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"run_{timestamp_str}_{retrieval_mode}.json"
    filepath = runs_dir / filename
    
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
        
    print(f"Evaluation completed. Saved to {filepath}")
    return summary

def get_evaluation_history() -> List[Dict[str, Any]]:
    """Fetch history of all runs from the runs directory"""
    base_dir = config.BASE_DIR
    runs_dir = base_dir / "app" / "eval" / "runs"
    os.makedirs(runs_dir, exist_ok=True)
    
    history = []
    for filename in os.listdir(runs_dir):
        if filename.startswith("run_") and filename.endswith(".json"):
            filepath = runs_dir / filename
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Return only summary info to keep payload light
                    history.append({
                        "filename": filename,
                        "timestamp": data.get("timestamp"),
                        "retrieval_mode": data.get("retrieval_mode"),
                        "averages": data.get("averages"),
                        "items_count": data.get("items_count")
                    })
            except Exception as e:
                print(f"Error reading eval run file {filename}: {e}")
                
    # Sort by timestamp (newest first)
    history.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return history

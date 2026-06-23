import json
from typing import List, Dict, Tuple, Any
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from app import config
from app.core.retrieval import retrieve_documents
from app.api.models import ConfidenceScore

def format_history(history_dicts: List[Dict[str, str]]) -> List[Any]:
    """Convert history dictionaries to LangChain message list"""
    messages = []
    for msg in history_dicts:
        role = msg.get("role")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role in ("assistant", "ai"):
            messages.append(AIMessage(content=content))
        elif role == "system":
            messages.append(SystemMessage(content=content))
    return messages

def rewrite_query_if_needed(user_question: str, history_messages: List[Any], model: ChatOpenAI) -> str:
    """Rewrite query to be standalone if chat history exists"""
    if not history_messages:
        return user_question
        
    messages = [
        SystemMessage(content="Given the chat history, rewrite the new question to be standalone and searchable in a vector database. Just return the rewritten question. Do not add any preamble.")
    ] + history_messages + [
        HumanMessage(content=f"New question: {user_question}")
    ]
    
    try:
        response = model.invoke(messages)
        return response.content.strip()
    except Exception as e:
        print(f"Query rewriting error: {e}")
        return user_question

def evaluate_confidence(query: str, answer: str, context: str, model: ChatOpenAI) -> Dict[str, Any]:
    """Ask LLM to self-assess how well the context supports the generated answer"""
    try:
        model_with_json = model.with_structured_output(ConfidenceScore)
        
        prompt = f"""You are a strict RAG evaluator. Assess how well the provided context supports the generated answer to the user's query.
        
        Query: {query}
        Context: {context}
        Answer: {answer}
        
        Rate the grounding from 0 to 100, and provide a clear one-sentence rationale. Return ONLY the JSON object matching the schema."""
        
        res = model_with_json.invoke(prompt)
        return {"score": res.score, "rationale": res.rationale}
    except Exception as e:
        print(f"Error evaluating confidence score: {e}")
        return {"score": 0, "rationale": f"Evaluation error: {str(e)}"}

def generate_chat_response(
    message: str, 
    history: List[Dict[str, str]], 
    retrieval_mode: str = "vector",
    k: int = 5
) -> Dict[str, Any]:
    """
    RAG chat loop:
    1. Parse history
    2. Rewrite query if needed
    3. Retrieve relevant documents
    4. Call LLM with documents context + history
    5. Evaluate confidence score
    """
    model = ChatOpenAI(
        model="gpt-4o",
        api_key=config.OPENAI_API_KEY,
        temperature=0
    )
    
    # 1. Format history
    history_messages = format_history(history)
    
    # 2. Rewrite query
    search_query = rewrite_query_if_needed(message, history_messages, model)
    
    # 3. Retrieve docs
    docs, notice = retrieve_documents(search_query, mode=retrieval_mode, k=k)
    
    # 4. Construct final system prompt with context
    docs_context = "\n".join([f"- {doc.page_content}" for doc in docs])
    
    system_prompt = f"""You are a helpful assistant that answers questions based on provided documents and conversation history.
    
    Based on the following documents, please answer this question: {message}
    
    Documents:
    {docs_context}
    
    Please provide a clear, helpful answer using only the information from these documents. If you can't find the answer in the documents, say "I don't have enough information to answer that question based on the provided documents."
    """
    
    messages = [
        SystemMessage(content=system_prompt)
    ] + history_messages + [
        HumanMessage(content=message)
    ]
    
    try:
        result = model.invoke(messages)
        answer = result.content
    except Exception as e:
        answer = f"Error generating answer: {str(e)}"
        
    # Format sources for response
    sources = []
    for doc in docs:
        sources.append({
            "content": doc.page_content,
            "source": doc.metadata.get("source", "unknown")
        })
        
    # 5. Evaluate confidence
    confidence = evaluate_confidence(message, answer, docs_context, model)
        
    return {
        "answer": answer,
        "sources": sources,
        "query_used": search_query,
        "notice": notice,
        "confidence": confidence
    }

def generate_chat_response_stream(
    message: str, 
    history: List[Dict[str, str]], 
    retrieval_mode: str = "vector",
    k: int = 5
):
    """RAG chat loop with Server-Sent Events (SSE) streaming"""
    model = ChatOpenAI(
        model="gpt-4o",
        api_key=config.OPENAI_API_KEY,
        temperature=0
    )
    
    # 1. Format history
    history_messages = format_history(history)
    
    # 2. Rewrite query
    search_query = rewrite_query_if_needed(message, history_messages, model)
    
    # 3. Retrieve docs
    docs, notice = retrieve_documents(search_query, mode=retrieval_mode, k=k)
    
    # Format sources
    sources = []
    for doc in docs:
        sources.append({
            "content": doc.page_content,
            "source": doc.metadata.get("source", "unknown")
        })
        
    # Step 1: Yield metadata first (standalone query, sources, notice)
    metadata = {
        "type": "metadata",
        "query_used": search_query,
        "sources": sources,
        "notice": notice
    }
    yield f"data: {json.dumps(metadata)}\n\n"
    
    # 4. Construct final system prompt with context
    docs_context = "\n".join([f"- {doc.page_content}" for doc in docs])
    
    system_prompt = f"""You are a helpful assistant that answers questions based on provided documents and conversation history.
    
    Based on the following documents, please answer this question: {message}
    
    Documents:
    {docs_context}
    
    Please provide a clear, helpful answer using only the information from these documents. If you can't find the answer in the documents, say "I don't have enough information to answer that question based on the provided documents."
    """
    
    messages = [
        SystemMessage(content=system_prompt)
    ] + history_messages + [
        HumanMessage(content=message)
    ]
    
    # Step 2: Stream answer tokens
    full_answer = ""
    try:
        for chunk in model.stream(messages):
            token = chunk.content
            full_answer += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
    except Exception as e:
        error_msg = f"\nError during streaming: {str(e)}"
        full_answer += error_msg
        yield f"data: {json.dumps({'type': 'token', 'content': error_msg})}\n\n"
        
    # Step 3: Evaluate confidence and yield score
    confidence = evaluate_confidence(message, full_answer, docs_context, model)
    yield f"data: {json.dumps({'type': 'confidence', 'confidence': confidence})}\n\n"
    
    # Step 4: Yield [DONE] signal
    yield "data: [DONE]\n\n"


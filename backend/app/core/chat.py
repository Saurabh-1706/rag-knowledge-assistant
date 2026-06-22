from typing import List, Dict, Tuple, Any
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from app import config
from app.core.retrieval import retrieve_documents

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
        
    return {
        "answer": answer,
        "sources": sources,
        "query_used": search_query,
        "notice": notice
    }

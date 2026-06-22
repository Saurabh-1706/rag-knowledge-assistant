const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface DocumentInfo {
  name: string;
  size: number;
  chunks: number;
  uploaded_at?: string;
}

export interface ChatSource {
  content: string;
  source: string;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  query_used: string;
  notice?: string;
}

export async function checkHealth() {
  const res = await fetch(`${API_URL}/api/health`);
  if (!res.ok) throw new Error('Backend health check failed');
  return res.json() as Promise<{ status: string; docs_count: number }>;
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
  retrievalMode: string
): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history,
      retrieval_mode: retrievalMode,
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to send chat message');
  }
  return res.json() as Promise<ChatResponse>;
}

export async function getDocuments(): Promise<DocumentInfo[]> {
  const res = await fetch(`${API_URL}/api/documents`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json() as Promise<DocumentInfo[]>;
}

export async function uploadDocument(file: File): Promise<{ success: boolean; chunks_created: number; doc_name: string }> {
  const formData = new FormData();
  formData.append('file', file);
  
  const res = await fetch(`${API_URL}/api/documents/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to upload document');
  }
  return res.json();
}

export async function deleteDocument(name: string): Promise<{ success: boolean; chunks_deleted: number }> {
  const res = await fetch(`${API_URL}/api/documents/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to delete document');
  }
  return res.json();
}

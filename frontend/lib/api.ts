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
  confidence?: {
    score: number;
    rationale: string;
  };
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

export async function sendChatMessageStream(
  message: string,
  history: ChatMessage[],
  retrievalMode: string,
  onChunk: (chunk: {
    type: 'metadata' | 'token' | 'confidence';
    content?: string;
    query_used?: string;
    sources?: ChatSource[];
    notice?: string;
    confidence?: {
      score: number;
      rationale: string;
    };
  }) => void
): Promise<void> {
  const res = await fetch(`${API_URL}/api/chat/stream`, {
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
    throw new Error(errorText || 'Failed to connect to streaming API');
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    
    // Keep the last partial line in the buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('data: ')) {
        const dataStr = trimmed.substring(6).trim();
        if (dataStr === '[DONE]') {
          break;
        }
        try {
          const parsed = JSON.parse(dataStr);
          onChunk(parsed);
        } catch (err) {
          console.error('Failed to parse SSE JSON:', err);
        }
      }
    }
  }
}

export async function getDocuments(): Promise<DocumentInfo[]> {
  const res = await fetch(`${API_URL}/api/documents`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json() as Promise<DocumentInfo[]>;
}

export async function uploadDocument(file: File): Promise<{ success: boolean; chunks_created: number; doc_name: string; job_id?: string; status?: string }> {
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

export async function ingestUrl(url: string): Promise<{ success: boolean; chunks_created: number; doc_name: string; job_id?: string; status?: string }> {
  const res = await fetch(`${API_URL}/api/documents/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to ingest URL');
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


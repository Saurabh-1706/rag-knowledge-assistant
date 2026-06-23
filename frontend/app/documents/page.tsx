'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Trash2, Database, AlertCircle, RefreshCw, Layers, CheckCircle, Globe } from 'lucide-react';
import { getDocuments, uploadDocument, ingestUrl, deleteDocument, DocumentInfo } from '@/lib/api';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [urlValue, setUrlValue] = useState('');
  const [jobStatusText, setJobStatusText] = useState<string | null>(null);

  const pollJobStatus = async (jobId: string): Promise<number> => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/documents/status/${jobId}`);
          if (!res.ok) throw new Error('Failed to fetch job status');
          const data = await res.json();
          
          if (data.status === 'completed') {
            clearInterval(interval);
            resolve(data.chunks_created);
          } else if (data.status === 'failed') {
            clearInterval(interval);
            reject(new Error(data.error || 'Ingestion failed'));
          } else {
            setJobStatusText(`Processing: ${data.chunks_created} chunks embedded so far...`);
          }
        } catch (err) {
          clearInterval(interval);
          reject(err);
        }
      }, 2000);
    });
  };

  const fetchDocs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDocuments();
      setDocuments(data);
    } catch (err: unknown) {
      console.error(err);
      setError('Failed to fetch ingested documents. Is the API online?');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Handle Drag & Drop Upload
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    setIsUploading(true);
    setError(null);
    setSuccessMsg(null);

    const file = acceptedFiles[0]; // upload one by one

    try {
      const response = await uploadDocument(file);
      if (response.job_id) {
        setJobStatusText('File uploaded. Running chunking and embedding in background...');
        const chunks = await pollJobStatus(response.job_id);
        setSuccessMsg(`Successfully ingested "${response.doc_name}" creating ${chunks} chunks.`);
      } else {
        setSuccessMsg(`Successfully uploaded "${response.doc_name}" creating ${response.chunks_created} chunks.`);
      }
      await fetchDocs();
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : `Failed to upload "${file.name}"`;
      setError(errMsg);
    } finally {
      setIsUploading(false);
      setJobStatusText(null);
    }
  }, [fetchDocs]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
  });

  // Handle Delete Document
  const handleDelete = async (name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This removes all chunks from Chroma.`)) return;

    setError(null);
    setSuccessMsg(null);
    try {
      const result = await deleteDocument(name);
      setSuccessMsg(`Deleted "${name}" (${result.chunks_deleted} chunks removed).`);
      await fetchDocs();
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to delete "${name}": ${errMsg}`);
    }
  };

  // Handle URL Ingestion Submit
  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlValue.trim() || isUploading) return;

    setIsUploading(true);
    setError(null);
    setSuccessMsg(null);

    const url = urlValue.trim();
    try {
      const response = await ingestUrl(url);
      if (response.job_id) {
        setJobStatusText('URL registered. Scraping and embedding page text in background...');
        const chunks = await pollJobStatus(response.job_id);
        setSuccessMsg(`Successfully ingested webpage: "${response.doc_name}" creating ${chunks} chunks.`);
      } else {
        setSuccessMsg(`Successfully ingested webpage: "${response.doc_name}" creating ${response.chunks_created} chunks.`);
      }
      setUrlValue('');
      await fetchDocs();
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to ingest URL: ${errMsg}`);
    } finally {
      setIsUploading(false);
      setJobStatusText(null);
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#080C14]">
      {/* Header Bar */}
      <header className="h-20 border-b border-[#1F2937]/50 flex items-center justify-between px-8 bg-[#090D16]/80 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-[#8B5CF6]" />
          <div>
            <h2 className="font-bold text-base text-white tracking-wide">Knowledge Base</h2>
            <p className="text-xs text-gray-500 font-medium">Ingest corporate documents into ChromaDB</p>
          </div>
        </div>

        <button
          onClick={fetchDocs}
          className="p-2 bg-[#111827] border border-[#1F2937]/50 hover:bg-[#1E293B] text-gray-400 hover:text-white rounded-xl transition-all duration-300 group"
          title="Refresh List"
        >
          <RefreshCw className={`w-4 h-4 group-hover:rotate-180 transition-transform duration-500 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-5xl w-full mx-auto">
        {/* Alerts / Info Banners */}
        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-sm text-rose-400">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3 text-sm text-emerald-400">
            <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tabs switcher */}
        <div className="flex border-b border-[#1F2937]/30 gap-6">
          <button
            onClick={() => { setActiveTab('upload'); setError(null); setSuccessMsg(null); }}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'upload'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            File Upload
          </button>
          <button
            onClick={() => { setActiveTab('url'); setError(null); setSuccessMsg(null); }}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'url'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            URL Ingestion
          </button>
        </div>

        {activeTab === 'upload' ? (
          /* Drop Zone Box */
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 relative overflow-hidden ${
              isDragActive
                ? 'border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/5'
                : 'border-[#1F2937] bg-[#111827]/30 hover:border-[#3B82F6]/40 hover:bg-[#111827]/50'
            }`}
          >
            <input {...getInputProps()} />
            <div className="p-4 bg-[#1E293B]/70 rounded-2xl mb-4 border border-[#1F2937] shadow-inner group-hover:scale-105 transition-transform duration-300">
              <UploadCloud className={`w-8 h-8 text-gray-400 ${isUploading ? 'animate-bounce' : ''}`} />
            </div>
            
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-white tracking-wide">
                {isUploading ? 'Ingesting document...' : 'Drag and drop your file here'}
              </p>
              <p className="text-xs text-gray-500">
                Supports <strong className="text-gray-400">.txt</strong> and <strong className="text-gray-400">.pdf</strong> files
              </p>
            </div>

            {isUploading && (
              <div className="absolute inset-0 bg-[#080C14]/70 backdrop-blur-sm flex flex-col items-center justify-center space-y-3">
                <div className="w-10 h-10 border-t-2 border-r-2 border-blue-500 rounded-full animate-spin" />
                <p className="text-xs font-semibold text-blue-400 animate-pulse">
                  {jobStatusText || 'Running chunking & embedding...'}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* URL Input Form */
          <form onSubmit={handleUrlSubmit} className="bg-[#111827]/30 border border-[#1F2937]/50 rounded-2xl p-8 space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="url-input" className="text-sm font-semibold text-white tracking-wide">
                Ingest Content from URL
              </label>
              <p className="text-xs text-gray-500">
                Provide a webpage URL (e.g. Wikipedia article, blog post, documentation) to extract and chunk its text.
              </p>
            </div>
            
            <div className="flex gap-3">
              <div className="flex-1 bg-[#111827] border border-[#1F2937]/50 rounded-xl px-4 py-2.5 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/50 transition-all duration-300 shadow-inner flex items-center gap-3">
                <Globe className="w-5 h-5 text-gray-500" />
                <input
                  id="url-input"
                  type="url"
                  required
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  placeholder="https://en.wikipedia.org/wiki/Artificial_intelligence"
                  className="flex-1 bg-transparent outline-none border-none text-sm text-gray-100 placeholder-gray-600"
                />
              </div>
              
              <button
                type="submit"
                disabled={!urlValue.trim() || isUploading}
                className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${
                  urlValue.trim() && !isUploading
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-md shadow-blue-500/20 hover:scale-105'
                    : 'bg-[#1F2937]/30 text-gray-600 border border-[#1F2937]/50'
                }`}
              >
                Ingest URL
              </button>
            </div>

            {isUploading && (
              <div className="flex items-center gap-3 text-xs text-blue-400 font-semibold pt-2">
                <div className="w-4 h-4 border-t-2 border-r-2 border-blue-500 rounded-full animate-spin" />
                <span className="animate-pulse">
                  {jobStatusText || 'Scraping page text, chunking & embedding...'}
                </span>
              </div>
            )}
          </form>
        )}

        {/* Ingested Documents List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#1F2937]/50 pb-3">
            <h3 className="font-bold text-sm text-white tracking-wider uppercase flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-500" />
              Ingested Documents
            </h3>
            <span className="text-xs text-gray-500 font-medium">Total: {documents.length} files</span>
          </div>

          {isLoading && documents.length === 0 ? (
            /* Loading State skeleton */
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-[#111827]/40 border border-[#1F2937]/35 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            /* Empty State */
            <div className="bg-[#111827]/25 border border-[#1F2937]/35 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-3">
              <FileText className="w-8 h-8 text-gray-600" />
              <p className="text-sm font-semibold text-gray-400">No documents ingested yet</p>
              <p className="text-xs text-gray-500 max-w-sm">
                Upload a company text file or PDF above to start querying it with semantic and hybrid search.
              </p>
            </div>
          ) : (
            /* Document Cards List */
            <div className="grid grid-cols-1 gap-3">
              {documents.map((doc) => (
                <div
                  key={doc.name}
                  className="bg-[#111827]/50 border border-[#1F2937]/35 hover:border-purple-500/20 hover:bg-[#111827]/85 rounded-xl p-4 flex items-center justify-between transition-all duration-300 shadow-sm"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="p-2.5 bg-[#1E293B] rounded-xl border border-slate-700/30 shadow-inner">
                      <FileText className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-white truncate max-w-[250px] sm:max-w-md">
                        {doc.name}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 font-medium">
                        <span>{formatBytes(doc.size)}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1F2937]" />
                        <span className="text-purple-400">{doc.chunks} chunks</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(doc.name)}
                    className="p-2.5 bg-[#1F2937]/30 hover:bg-rose-500/10 text-gray-500 hover:text-rose-400 rounded-xl border border-transparent hover:border-rose-500/20 transition-all duration-300"
                    title="Delete Document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

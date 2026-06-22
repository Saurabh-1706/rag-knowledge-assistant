'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, Folder, Database, Sparkles, Activity } from 'lucide-react';
import { checkHealth } from '@/lib/api';

export default function Sidebar() {
  const pathname = usePathname();
  const [dbStatus, setDbStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [docsCount, setDocsCount] = useState<number>(0);

  useEffect(() => {
    let active = true;
    async function getHealth() {
      try {
        const health = await checkHealth();
        if (active) {
          setDbStatus('online');
          setDocsCount(health.docs_count);
        }
      } catch (err) {
        console.error("Health check error:", err);
        if (active) {
          setDbStatus('offline');
          setDocsCount(0);
        }
      }
    }

    getHealth();
    const interval = setInterval(getHealth, 10000); // Check every 10s

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const navItems = [
    {
      name: 'Chat Workspace',
      href: '/chat',
      icon: MessageSquare,
      description: 'Q&A, hybrid search & rerank',
    },
    {
      name: 'Knowledge Base',
      href: '/documents',
      icon: Folder,
      description: 'Upload & manage files',
    },
  ];

  return (
    <aside className="w-80 h-screen bg-[#0B0F19] border-r border-[#1F2937]/50 flex flex-col justify-between p-6 shrink-0 font-sans text-gray-300">
      <div className="flex flex-col gap-8">
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-[#3B82F6] to-[#8B5CF6] rounded-xl shadow-lg shadow-[#3B82F6]/20">
            <Sparkles className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white leading-tight bg-gradient-to-r from-white via-gray-100 to-gray-400 bg-clip-text text-transparent">
              RAG Assistant
            </h1>
            <p className="text-xs text-gray-500 font-semibold tracking-wider uppercase">
              Knowledge Brain
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex flex-col gap-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-start gap-4 p-4 rounded-xl transition-all duration-300 group border ${
                  isActive
                    ? 'bg-[#1E293B] border-[#3B82F6]/30 text-white shadow-inner shadow-[#3B82F6]/5'
                    : 'border-transparent hover:bg-[#111827] hover:border-[#1F2937]/50 text-gray-400 hover:text-gray-200'
                }`}
              >
                <Icon
                  className={`w-5 h-5 mt-0.5 transition-transform duration-300 group-hover:scale-110 ${
                    isActive ? 'text-[#3B82F6]' : 'text-gray-500 group-hover:text-gray-400'
                  }`}
                />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-sm tracking-wide">{item.name}</span>
                  <span className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors">
                    {item.description}
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Connection & DB Info Panel */}
      <div className="flex flex-col gap-4 p-4 bg-[#111827]/70 rounded-xl border border-[#1F2937]/30 shadow-inner">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-semibold text-gray-400">System Link</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                dbStatus === 'online'
                  ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-ping-slow'
                  : dbStatus === 'offline'
                  ? 'bg-rose-500 shadow-lg shadow-rose-500/50'
                  : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span className="text-xs font-bold capitalize text-white">
              {dbStatus === 'checking' ? 'Connecting...' : dbStatus}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#1F2937]/50 pt-2.5">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-semibold text-gray-400">Stored Chunks</span>
          </div>
          <span className="text-xs font-extrabold text-white bg-[#1E293B] px-2 py-0.5 rounded border border-[#3B82F6]/20">
            {docsCount}
          </span>
        </div>
      </div>
    </aside>
  );
}

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, BarChart3, RotateCw, AlertCircle, History, Play, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

interface EvalRunSummary {
  filename: string;
  timestamp: string;
  retrieval_mode: string;
  averages: {
    faithfulness: number;
    relevancy: number;
    precision: number;
    recall: number;
  };
  items_count: number;
}

interface EvalRunDetail extends EvalRunSummary {
  results: Array<{
    question: string;
    ground_truth: string;
    answer: string;
    sources: string[];
    metrics: {
      faithfulness: number;
      relevancy: number;
      precision: number;
      recall: number;
    };
    details: Record<string, unknown>;
  }>;
}

export default function EvalPage() {
  const [history, setHistory] = useState<EvalRunSummary[]>([]);
  const [selectedMode, setSelectedMode] = useState<string>('vector');
  const [selectedRun, setSelectedRun] = useState<EvalRunDetail | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // Fetch full details of a specific run
  const loadRunDetails = useCallback(async (filename: string) => {
    setError(null);
    try {
      // Since history endpoint returns summary, we run a GET to runs folder or load full summary from history if it has results,
      // but wait: evaluator saves runs as full files. Let's load the full file.
      // We can create a simple backend endpoint to read details, or since uvicorn is running, we can fetch the run file via main.py 
      // but wait! How does frontend read details? 
      // Ah! In main.py, the /api/eval/history returned summaries, but we can make it return the full runs or add an endpoint GET /api/eval/run/{filename}.
      // Wait, did we add GET /api/eval/run/{filename}? No, we didn't add it in main.py yet.
      // But wait! We can fetch the history run files or let's check: does history endpoint return summaries?
      // Yes, get_evaluation_history returns the averages and summaries.
      // Let's modify evaluator.py or main.py to fetch details, or let's write a quick endpoint:
      // Let's add GET /api/eval/run/{filename} to main.py!
      // But wait, can we load the detailed run from a new endpoint? Yes, let's fetch it.
      const res = await fetch(`${API_URL}/api/eval/run/${filename}`);
      if (!res.ok) {
        // If endpoint not ready yet, we will fetch it. Let's make sure the endpoint is created.
        throw new Error('Failed to load run details');
      }
      const data = await res.json();
      setSelectedRun(data);
    } catch (err: unknown) {
      console.error(err);
      setError('Failed to fetch detailed metrics for this run.');
    }
  }, [API_URL]);

  // Fetch past run summaries
  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/eval/history`);
      if (!res.ok) throw new Error('Failed to fetch evaluation history');
      const data = await res.json();
      setHistory(data);
      
      // Load details of the latest run automatically if available
      if (data.length > 0 && !selectedRun) {
        loadRunDetails(data[0].filename);
      }
    } catch (err: unknown) {
      console.error(err);
      setError('Could not load evaluation history. Is the backend server running?');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [API_URL, selectedRun, loadRunDetails]);

  // Load history on mount
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Run new evaluation
  const handleRunEvaluation = async () => {
    setIsEvaluating(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/eval/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retrieval_mode: selectedMode })
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Failed to complete evaluation run');
      }
      const runSummary = await res.json();
      setSelectedRun(runSummary);
      await fetchHistory();
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : 'Unknown evaluation error';
      setError(`Evaluation run failed: ${errMsg}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Helper to draw clean SVG Radar Chart
  const renderRadarChart = () => {
    if (!selectedRun) return null;
    
    const averages = selectedRun.averages;
    const metrics = [
      { name: 'Faithfulness', val: averages.faithfulness, angle: -Math.PI / 2 }, // Top
      { name: 'Relevancy', val: averages.relevancy, angle: 0 },                  // Right
      { name: 'Recall', val: averages.recall, angle: Math.PI / 2 },              // Bottom
      { name: 'Precision', val: averages.precision, angle: Math.PI }             // Left
    ];

    const cx = 150;
    const cy = 150;
    const rMax = 100;

    // Draw concentric scale lines (25%, 50%, 75%, 100%)
    const scales = [25, 50, 75, 100];
    const scalePolygons = scales.map((scale) => {
      const r = (scale / 100) * rMax;
      const pts = metrics.map((m) => {
        const x = cx + r * Math.cos(m.angle);
        const y = cy + r * Math.sin(m.angle);
        return `${x},${y}`;
      }).join(' ');
      
      return (
        <polygon
          key={scale}
          points={pts}
          fill="none"
          stroke="#1F2937"
          strokeWidth="1"
          strokeDasharray={scale === 100 ? '0' : '3,3'}
        />
      );
    });

    // Draw axes lines and text labels
    const axesAndLabels = metrics.map((m, idx) => {
      const xLine = cx + rMax * Math.cos(m.angle);
      const yLine = cy + rMax * Math.sin(m.angle);
      
      // Offset text slightly outside the chart bounds
      const textOffset = 18;
      const xText = cx + (rMax + textOffset) * Math.cos(m.angle);
      const yText = cy + (rMax + textOffset) * Math.sin(m.angle);
      
      let textAnchor: 'start' | 'end' | 'middle' | 'inherit' = 'middle';
      if (m.angle === 0) textAnchor = 'start';
      if (m.angle === Math.PI) textAnchor = 'end';

      return (
        <g key={idx}>
          <line x1={cx} y1={cy} x2={xLine} y2={yLine} stroke="#1F2937" strokeWidth="1" />
          <text
            x={xText}
            y={yText + 4}
            fill="#9CA3AF"
            fontSize="10"
            fontWeight="bold"
            textAnchor={textAnchor}
            className="tracking-wider uppercase"
          >
            {m.name}
          </text>
        </g>
      );
    });

    // Draw active score polygon
    const scorePoints = metrics.map((m) => {
      const r = (m.val / 100) * rMax;
      const x = cx + r * Math.cos(m.angle);
      const y = cy + r * Math.sin(m.angle);
      return `${x},${y}`;
    }).join(' ');

    const modeColors: Record<string, string> = {
      vector: '#3B82F6',
      hybrid: '#8B5CF6',
      rerank: '#EC4899',
      multiquery: '#10B981'
    };
    
    const color = modeColors[selectedRun.retrieval_mode] || '#3B82F6';

    const scoreDots = metrics.map((m, idx) => {
      const r = (m.val / 100) * rMax;
      const x = cx + r * Math.cos(m.angle);
      const y = cy + r * Math.sin(m.angle);
      return (
        <g key={idx}>
          <circle cx={x} cy={y} r="4" fill={color} />
          <text x={x} y={y - 8} fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">
            {m.val}%
          </text>
        </g>
      );
    });

    return (
      <svg width="300" height="300" className="mx-auto select-none">
        {/* Grids */}
        {scalePolygons}
        {axesAndLabels}
        {/* Active Polygon Area */}
        <polygon
          points={scorePoints}
          fill={`${color}1A`}
          stroke={color}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Active Points with Score labels */}
        {scoreDots}
      </svg>
    );
  };

  const getModeLabel = (mode: string) => {
    const labels: Record<string, string> = {
      vector: 'Vector (Basic)',
      hybrid: 'Hybrid (BM25)',
      rerank: 'Rerank (Cohere)',
      multiquery: 'Multi-Query (RRF)'
    };
    return labels[mode] || mode;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#080C14]">
      {/* Header */}
      <header className="h-20 border-b border-[#1F2937]/50 flex items-center justify-between px-8 bg-[#090D16]/80 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-[#10B981]" />
          <div>
            <h2 className="font-bold text-base text-white tracking-wide">Evaluation Pipeline</h2>
            <p className="text-xs text-gray-500 font-medium">Measure retrieval faithfulness and recall metrics</p>
          </div>
        </div>

        <button
          onClick={fetchHistory}
          disabled={isLoadingHistory || isEvaluating}
          className="p-2 bg-[#111827] border border-[#1F2937]/50 hover:bg-[#1E293B] text-gray-400 hover:text-white rounded-xl transition-all duration-300 group disabled:opacity-50"
          title="Refresh history"
        >
          <RotateCw className={`w-4 h-4 group-hover:rotate-180 transition-transform duration-500 ${isLoadingHistory ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Main Grid Content */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-6xl w-full mx-auto">
        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-sm text-rose-400">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Dashboard Panels Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Panel 1: Trigger and Chart */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#111827]/30 border border-[#1F2937]/50 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-1.5 text-center md:text-left">
                <h3 className="font-bold text-white text-sm tracking-wide">Trigger Automated Test Set</h3>
                <p className="text-xs text-gray-500 max-w-sm">
                  Run LLM-as-a-judge evaluations over 10 standardized corporate QA pairs to test performance.
                </p>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
                <select
                  value={selectedMode}
                  onChange={(e) => setSelectedMode(e.target.value)}
                  className="bg-[#111827] border border-[#1F2937]/60 text-xs text-white rounded-xl py-2 px-3 focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  <option value="vector">Vector Search</option>
                  <option value="hybrid">Hybrid Search</option>
                  <option value="rerank">Cohere Rerank</option>
                  <option value="multiquery">Multi-Query (RRF)</option>
                </select>

                <button
                  onClick={handleRunEvaluation}
                  disabled={isEvaluating}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-500/10 hover:scale-105 transition-all duration-300 disabled:opacity-50"
                >
                  {isEvaluating ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Judging Runs...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4.5 h-4.5" />
                      <span>Run Evaluation</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Selected Run Details Display */}
            {selectedRun ? (
              <div className="bg-[#111827]/20 border border-[#1F2937]/35 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                      Current Report
                    </span>
                    <h3 className="text-lg font-bold text-white">
                      {getModeLabel(selectedRun.retrieval_mode)} Results
                    </h3>
                    <p className="text-xs text-gray-400">
                      Evaluated on {new Date(selectedRun.timestamp).toLocaleString()}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Faithfulness', score: selectedRun.averages.faithfulness, desc: 'Context Grounding' },
                      { label: 'Answer Relevancy', score: selectedRun.averages.relevancy, desc: 'Question Matching' },
                      { label: 'Context Precision', score: selectedRun.averages.precision, desc: 'Ranking Quality' },
                      { label: 'Context Recall', score: selectedRun.averages.recall, desc: 'Coverage Quality' }
                    ].map((metric) => (
                      <div key={metric.label} className="p-3 bg-[#111827]/40 border border-[#1F2937]/20 rounded-xl space-y-1">
                        <span className="text-[10px] text-gray-500 font-semibold block uppercase tracking-wider">{metric.label}</span>
                        <span className="text-xl font-bold text-white block">{metric.score}%</span>
                        <span className="text-[9px] text-gray-400 block">{metric.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#111827]/10 p-2 rounded-xl flex items-center justify-center">
                  {renderRadarChart()}
                </div>
              </div>
            ) : (
              <div className="bg-[#111827]/20 border border-[#1F2937]/35 rounded-2xl p-16 text-center space-y-3">
                <BarChart3 className="w-8 h-8 text-gray-600 mx-auto" />
                <p className="text-sm font-semibold text-gray-400">No evaluation report loaded</p>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  Run an evaluation above or choose a past report from the logs panel to see performance scores.
                </p>
              </div>
            )}
          </div>

          {/* Panel 2: History Runs */}
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-white tracking-wider uppercase flex items-center gap-2 border-b border-[#1F2937]/50 pb-3">
              <History className="w-4 h-4 text-gray-400" />
              Evaluation History Logs
            </h3>

            {isLoadingHistory && history.length === 0 ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-[#111827]/40 border border-[#1F2937]/35 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <p className="text-xs text-gray-500 italic py-6 text-center">No past runs found</p>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1 scrollbar-thin">
                {history.map((run) => {
                  const isCurrent = selectedRun?.filename === run.filename;
                  
                  return (
                    <div
                      key={run.filename}
                      onClick={() => loadRunDetails(run.filename)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-300 flex items-center justify-between ${
                        isCurrent
                          ? 'bg-blue-500/10 border-blue-500/35 hover:bg-blue-500/15'
                          : 'bg-[#111827]/50 border-[#1F2937]/35 hover:border-slate-700 hover:bg-[#111827]/85'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <span className="text-xs font-semibold text-white block truncate">
                          {getModeLabel(run.retrieval_mode)}
                        </span>
                        <span className="text-[10px] text-gray-500 block">
                          {new Date(run.timestamp).toLocaleString()}
                        </span>
                      </div>
                      
                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold text-white block">
                          Avg: {Math.round(
                            (run.averages.faithfulness +
                              run.averages.relevancy +
                              run.averages.precision +
                              run.averages.recall) / 4
                          )}%
                        </span>
                        <span className="text-[9px] text-gray-500 block">
                          {run.items_count} items
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Question-by-Question breakdown table */}
        {selectedRun && (
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-white tracking-wider uppercase flex items-center gap-2 border-b border-[#1F2937]/50 pb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Detailed Run Breakdown
            </h3>

            <div className="bg-[#111827]/30 border border-[#1F2937]/50 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#090D16] border-b border-[#1F2937]/50 text-gray-400 font-bold uppercase tracking-wider">
                      <th className="p-4 w-8">#</th>
                      <th className="p-4 w-1/3">Question</th>
                      <th className="p-4 text-center">Faithfulness</th>
                      <th className="p-4 text-center">Relevancy</th>
                      <th className="p-4 text-center">Precision</th>
                      <th className="p-4 text-center">Recall</th>
                      <th className="p-4 text-center w-16">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2937]/35">
                    {selectedRun.results.map((res, idx) => {
                      const isExpanded = expandedIndex === idx;
                      
                      return (
                        <React.Fragment key={idx}>
                          <tr className="hover:bg-[#111827]/60 transition-colors">
                            <td className="p-4 text-gray-500 font-semibold">{idx + 1}</td>
                            <td className="p-4 font-semibold text-white leading-relaxed">{res.question}</td>
                            <td className="p-4 text-center font-bold text-gray-200">{res.metrics.faithfulness}%</td>
                            <td className="p-4 text-center font-bold text-gray-200">{res.metrics.relevancy}%</td>
                            <td className="p-4 text-center font-bold text-gray-200">{res.metrics.precision}%</td>
                            <td className="p-4 text-center font-bold text-gray-200">{res.metrics.recall}%</td>
                            <td className="p-4 text-center">
                              <button
                                onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                                className="p-1.5 hover:bg-[#1E293B] text-gray-400 hover:text-white rounded-lg transition-colors"
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-[#090D16]/50">
                              <td colSpan={7} className="p-6 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px] leading-relaxed">
                                  <div className="space-y-1.5">
                                    <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Generated Answer</span>
                                    <p className="bg-[#111827] border border-[#1F2937]/35 rounded-xl p-3.5 text-gray-200 whitespace-pre-wrap shadow-inner">{res.answer}</p>
                                  </div>
                                  <div className="space-y-1.5">
                                    <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Ground Truth Reference</span>
                                    <p className="bg-[#111827] border border-[#1F2937]/35 rounded-xl p-3.5 text-gray-300 whitespace-pre-wrap shadow-inner">{res.ground_truth}</p>
                                  </div>
                                </div>
                                
                                <div className="space-y-1.5">
                                  <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">Sources Used ({res.sources.length})</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {res.sources.map((src, sIdx) => (
                                      <span key={sIdx} className="bg-slate-800 border border-slate-700 text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded">
                                        {src}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

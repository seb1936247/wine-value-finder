import { useState, useEffect } from 'react';
import UploadZone from './components/UploadZone.tsx';
import WineTable from './components/WineTable.tsx';
import { useWineSession } from './hooks/useWineSession.ts';

const API = import.meta.env.VITE_API_URL || '/api';

function ParsingProgress() {
  const [elapsed, setElapsed] = useState(0);
  const steps = [
    { label: 'Uploading image...', at: 0 },
    { label: 'Reading wine list...', at: 2 },
    { label: 'Extracting wine names & prices...', at: 6 },
    { label: 'Identifying vintages & regions...', at: 12 },
    { label: 'Almost done...', at: 20 },
  ];

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const currentStep = [...steps].reverse().find(s => elapsed >= s.at) || steps[0];
  const fakePct = Math.min(90, Math.round(50 * (1 - Math.exp(-elapsed / 10)) + elapsed * 1.5));

  return (
    <div className="max-w-md mx-auto py-16 animate-fade-in">
      <div className="card p-8 border-wine-200/50 bg-wine-50/30">
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-wine-100 flex items-center justify-center animate-pulse-slow">
            <span className="text-2xl">🍷</span>
          </div>
        </div>
        <p className="text-center text-lg font-semibold text-slate-800 mb-1">
          {currentStep.label}
        </p>
        <p className="text-center text-xs text-slate-400 mb-5 tabular-nums">
          {elapsed}s elapsed
        </p>
        <div className="w-full bg-wine-200/40 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-wine-500 h-full rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${fakePct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { session, uploading, error, upload, startLookup, editWine, reset } = useWineSession();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Branded header */}
      <header className="text-center mb-10">
        <div className="inline-flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-wine-600 flex items-center justify-center shadow-sm">
            <span className="text-lg text-white">🍷</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Wine Value Finder</h1>
        </div>
        <p className="text-slate-500 text-sm">
          Upload a restaurant wine list &middot; find the best value wines instantly
        </p>
      </header>

      {!session || (session.status === 'error' && session.wines.length === 0) ? (
        <div className="max-w-xl mx-auto animate-fade-in">
          <UploadZone onUpload={upload} uploading={uploading} />
          {error && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm animate-fade-in">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}
          {session?.status === 'error' && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm animate-fade-in">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Parsing failed: {session.error}</span>
            </div>
          )}
        </div>
      ) : session.status === 'parsing' ? (
        <ParsingProgress />
      ) : (
        <div className="animate-fade-in">
          {/* Sticky action bar */}
          <div className="sticky top-0 z-40 -mx-4 px-4 py-3 bg-slate-50/80 backdrop-blur-md border-b border-slate-200/60 mb-4 flex justify-between items-center">
            <button
              onClick={reset}
              className="text-sm text-slate-500 hover:text-wine-600 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              New list
            </button>
            {session.status === 'complete' && (
              <a
                href={`${API}/wines/${session.id}/export`}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV
              </a>
            )}
          </div>

          {session.status === 'error' && session.wines.length > 0 && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Lookup error: {session.error}. Partial results shown below.</span>
            </div>
          )}

          <WineTable
            wines={session.wines}
            status={session.status}
            currency={session.currency || 'USD'}
            sessionId={session.id}
            onStartLookup={startLookup}
            onEditWine={editWine}
          />
        </div>
      )}

      <footer className="text-center mt-16 pb-6 text-xs text-slate-400">
        Prices and ratings sourced via web search. Click scores to verify on Wine-Searcher & CellarTracker.
      </footer>
    </div>
  );
}

import { useState, useEffect } from 'react';
import UploadZone from './components/UploadZone.tsx';
import WineTable from './components/WineTable.tsx';
import { useWineSession } from './hooks/useWineSession.ts';

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
  // Fake progress that slows down as it approaches 90%
  const fakePct = Math.min(90, Math.round(50 * (1 - Math.exp(-elapsed / 10)) + elapsed * 1.5));

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
        <div className="flex justify-center mb-4">
          <div className="animate-spin w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full" />
        </div>
        <p className="text-center text-lg font-medium text-purple-800 mb-1">
          {currentStep.label}
        </p>
        <p className="text-center text-xs text-purple-400 mb-4">
          {elapsed}s elapsed
        </p>
        <div className="w-full bg-purple-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-purple-600 h-full rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${fakePct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { session, uploading, error, upload, startLookup, editWine } = useWineSession();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Wine Value Finder</h1>
        <p className="text-gray-500 mt-2">
          Upload a restaurant wine list to find the best bang for your buck
        </p>
      </header>

      {!session || session.status === 'error' ? (
        <div className="max-w-xl mx-auto">
          <UploadZone onUpload={upload} uploading={uploading} />
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          {session?.status === 'error' && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              Parsing failed: {session.error}
            </div>
          )}
        </div>
      ) : session.status === 'parsing' ? (
        <ParsingProgress />
      ) : (
        <>
          <div className="flex justify-between items-center mb-2">
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-gray-500 hover:text-purple-600 transition-colors"
            >
              Upload a different list
            </button>
            {session.status === 'complete' && (
              <a
                href={`/api/wines/${session.id}/export`}
                className="text-sm text-purple-600 hover:text-purple-800 transition-colors"
              >
                Download CSV
              </a>
            )}
          </div>
          <WineTable
            wines={session.wines}
            status={session.status}
            currency={session.currency || 'USD'}
            onStartLookup={startLookup}
            onEditWine={editWine}
          />
        </>
      )}

      <footer className="text-center mt-12 text-xs text-gray-400">
        Prices and ratings are AI-estimated. Click critic/community scores to verify on Wine-Searcher and CellarTracker.
      </footer>
    </div>
  );
}

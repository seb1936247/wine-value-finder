import UploadZone from './components/UploadZone.tsx';
import WineTable from './components/WineTable.tsx';
import { useWineSession } from './hooks/useWineSession.ts';

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
        <div className="text-center py-16">
          <div className="animate-spin inline-block w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full mb-4" />
          <p className="text-lg text-gray-600">Claude is reading your wine list...</p>
          <p className="text-sm text-gray-400 mt-1">This may take a moment for large menus</p>
        </div>
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

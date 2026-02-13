import { useState, useMemo, useEffect } from 'react';
import type { WineValueResult } from '../types/wine.ts';
import ValueBadge from './ValueBadge.tsx';
import EditWineModal from './EditWineModal.tsx';

const API = import.meta.env.VITE_API_URL || '/api';

interface Props {
  wines: WineValueResult[];
  status: string;
  currency: string;
  sessionId: string;
  onStartLookup: () => void;
  onEditWine: (index: number, updates: Record<string, unknown>) => void;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', GBP: '\u00A3', EUR: '\u20AC', AUD: 'A$', CAD: 'C$', CHF: 'CHF ',
};

type SortKey = 'name' | 'vintage' | 'restaurantPrice' | 'retailPriceAvg' | 'markupPercent' | 'criticScore' | 'communityScore' | 'valueScore';

// Bug fix #2: 4-tier markup color function + mini progress bar
function markupColor(pct: number): { text: string; bg: string; bar: string } {
  if (pct <= 80) return { text: 'text-emerald-700', bg: 'bg-emerald-100', bar: 'bg-emerald-500' };
  if (pct <= 120) return { text: 'text-yellow-700', bg: 'bg-yellow-100', bar: 'bg-yellow-500' };
  if (pct <= 200) return { text: 'text-orange-700', bg: 'bg-orange-100', bar: 'bg-orange-500' };
  return { text: 'text-red-700', bg: 'bg-red-100', bar: 'bg-red-500' };
}

export default function WineTable({ wines, status, currency, sessionId, onStartLookup, onEditWine }: Props) {
  const sym = CURRENCY_SYMBOLS[currency] || currency + ' ';
  const [sortKey, setSortKey] = useState<SortKey>('valueScore');
  const [sortAsc, setSortAsc] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  // Bug fix #1: WeakMap for stable original-index lookup (handles duplicates)
  const wineIndexMap = useMemo(() => {
    const map = new WeakMap<WineValueResult, number>();
    wines.forEach((w, i) => map.set(w, i));
    return map;
  }, [wines]);

  // Auto-start lookup as soon as wines are parsed
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (status === 'parsed' && !autoStarted && wines.length > 0) {
      setAutoStarted(true);
      onStartLookup();
    }
  }, [status, autoStarted, wines.length, onStartLookup]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'name');
    }
  };

  const sorted = useMemo(() => {
    const copy = [...wines];
    copy.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });
    return copy;
  }, [wines, sortKey, sortAsc]);

  const lookupProgress = wines.filter(w => w.lookupStatus !== 'pending').length;
  const isLookingUp = status === 'looking_up';
  const progressPct = wines.length > 0 ? Math.round((lookupProgress / wines.length) * 100) : 0;

  // Bug fix #3: Detect retry phase — all attempted but status is still looking_up
  const allAttempted = wines.length > 0 && wines.every(w => w.lookupStatus !== 'pending');
  const isRetrying = isLookingUp && allAttempted;

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-wine-600 select-none transition-colors"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === field && (
          <span className="text-wine-500">{sortAsc ? '\u25B2' : '\u25BC'}</span>
        )}
      </span>
    </th>
  );

  return (
    <div className="mt-6 animate-fade-in">
      {/* Progress banner during lookup */}
      {isLookingUp && (
        <div className="mb-6 card p-5 border-wine-200 bg-wine-50/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wine-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-wine-500" />
              </span>
              <span className="text-sm font-semibold text-wine-800">
                {isRetrying ? 'Pass 2: Retrying missing wines...' : 'Looking up prices & ratings...'}
              </span>
            </div>
            <span className="text-sm font-bold text-wine-700 tabular-nums">
              {lookupProgress}/{wines.length} ({progressPct}%)
            </span>
          </div>
          <div className="w-full bg-wine-200/60 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-wine-500 h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${isRetrying ? 100 : progressPct}%` }}
            />
          </div>
          <p className="text-xs text-wine-500/80 mt-2">
            {isRetrying ? 'Getting fresh results for wines with missing data' : 'Results appear below as they come in'}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          {wines.length} Wine{wines.length !== 1 ? 's' : ''} Found
        </h2>
        <div className="flex gap-2">
          {status === 'parsed' && (
            <button onClick={onStartLookup} className="btn-primary">
              Look Up Prices & Ratings
            </button>
          )}
          {/* Bug fix #4: Only show Export when complete */}
          {status === 'complete' && (
            <a href={`${API}/wines/${sessionId}/export`} className="btn-secondary">
              Export CSV
            </a>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50/80 border-b border-slate-200/60">
              <tr>
                <SortHeader label="Wine" field="name" />
                <SortHeader label="Yr" field="vintage" />
                <SortHeader label={`Menu ${sym.trim()}`} field="restaurantPrice" />
                <SortHeader label={`Retail ${sym.trim()}`} field="retailPriceAvg" />
                <SortHeader label="Markup" field="markupPercent" />
                <SortHeader label="Critic" field="criticScore" />
                <SortHeader label="Community" field="communityScore" />
                <SortHeader label="Value" field="valueScore" />
                <th className="px-3 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((wine) => {
                const originalIndex = wineIndexMap.get(wine) ?? 0;
                const lowConfidence = wine.confidence < 0.8;
                return (
                  <tr
                    key={originalIndex}
                    className={`hover:bg-slate-50/80 transition-colors ${lowConfidence ? 'bg-amber-50/40' : ''}`}
                  >
                    {/* Wine name — visual anchor */}
                    <td className="px-3 py-3 max-w-[280px]">
                      <div className="text-sm font-semibold text-slate-900 truncate">{wine.name}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {wine.producer}{wine.region ? ` \u00B7 ${wine.region}` : ''}
                      </div>
                      {lowConfidence && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium mt-0.5">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                          </svg>
                          Review
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-500 tabular-nums">
                      {wine.vintage ?? 'NV'}
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-900 tabular-nums">
                      {sym}{wine.restaurantPrice}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600 tabular-nums">
                      {wine.retailPriceAvg !== null ? `${sym}${wine.retailPriceAvg}` : (
                        wine.lookupStatus === 'pending' && isLookingUp ? (
                          <span className="inline-block w-4 h-4 border-2 border-wine-400 border-t-transparent rounded-full animate-spin" />
                        ) : wine.lookupStatus === 'not_found' ? (
                          <span className="text-xs text-slate-300">N/A</span>
                        ) : <span className="text-slate-300">--</span>
                      )}
                    </td>
                    {/* Bug fix #2: Markup with gradient colors + mini bar */}
                    <td className="px-3 py-3">
                      {wine.markupPercent !== null ? (
                        <div className="space-y-1">
                          <span className={`text-sm font-medium tabular-nums ${markupColor(wine.markupPercent).text}`}>
                            {wine.markupPercent}%
                          </span>
                          <div className={`w-12 h-1.5 rounded-full ${markupColor(wine.markupPercent).bg}`}>
                            <div
                              className={`h-full rounded-full ${markupColor(wine.markupPercent).bar}`}
                              style={{ width: `${Math.min(100, (wine.markupPercent / 300) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : <span className="text-sm text-slate-300">--</span>}
                    </td>
                    <td className="px-3 py-3 text-sm tabular-nums">
                      {wine.criticScore !== null ? (
                        <a
                          href={wine.wineSearcherUrl ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-wine-600 hover:decoration-wine-300 transition-colors"
                        >
                          {wine.criticScore}
                        </a>
                      ) : <span className="text-slate-300">--</span>}
                    </td>
                    <td className="px-3 py-3 text-sm tabular-nums">
                      {wine.communityScore !== null ? (
                        <a
                          href={wine.cellarTrackerUrl ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-wine-600 hover:decoration-wine-300 transition-colors"
                        >
                          {wine.communityScore}
                          {wine.communityReviewCount != null && wine.communityReviewCount > 0 && (
                            <span className="text-[11px] text-slate-400 ml-1 no-underline">({wine.communityReviewCount})</span>
                          )}
                        </a>
                      ) : <span className="text-slate-300">--</span>}
                    </td>
                    <td className="px-3 py-3">
                      <ValueBadge score={wine.valueScore} />
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => setEditIndex(originalIndex)}
                        className="text-slate-300 hover:text-wine-600 transition-colors"
                        title="Edit wine"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editIndex !== null && (
        <EditWineModal
          wine={wines[editIndex]}
          index={editIndex}
          onSave={onEditWine}
          onClose={() => setEditIndex(null)}
        />
      )}
    </div>
  );
}

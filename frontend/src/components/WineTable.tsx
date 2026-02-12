import { useState, useMemo, useEffect } from 'react';
import type { WineValueResult } from '../types/wine.ts';
import ValueBadge from './ValueBadge.tsx';
import EditWineModal from './EditWineModal.tsx';

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

export default function WineTable({ wines, status, currency, sessionId, onStartLookup, onEditWine }: Props) {
  const sym = CURRENCY_SYMBOLS[currency] || currency + ' ';
  const [sortKey, setSortKey] = useState<SortKey>('valueScore');
  const [sortAsc, setSortAsc] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);

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
  const hasLookupData = wines.some(w => w.lookupStatus !== 'pending');
  const progressPct = wines.length > 0 ? Math.round((lookupProgress / wines.length) * 100) : 0;

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-purple-600 select-none"
      onClick={() => handleSort(field)}
    >
      {label}
      {sortKey === field && (
        <span className="ml-1">{sortAsc ? '\u25B2' : '\u25BC'}</span>
      )}
    </th>
  );

  return (
    <div className="mt-6">
      {/* Big progress banner during lookup */}
      {isLookingUp && (
        <div className="mb-6 bg-purple-50 border border-purple-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-purple-800">
              Looking up prices & ratings...
            </span>
            <span className="text-sm font-bold text-purple-700">
              {lookupProgress}/{wines.length} ({progressPct}%)
            </span>
          </div>
          <div className="w-full bg-purple-200 rounded-full h-3 overflow-hidden">
            <div
              className="bg-purple-600 h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-purple-500 mt-2">
            Results appear below as they come in
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          {wines.length} Wine{wines.length !== 1 ? 's' : ''} Found
        </h2>
        <div className="flex gap-2">
          {status === 'parsed' && (
            <button
              onClick={onStartLookup}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              Look Up Prices & Ratings
            </button>
          )}
          {(status === 'complete' || hasLookupData) && (
            <a
              href={`/api/wines/${sessionId}/export`}
              className="border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Export CSV
            </a>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <SortHeader label="Wine" field="name" />
              <SortHeader label="Vintage" field="vintage" />
              <SortHeader label="Menu $" field="restaurantPrice" />
              <SortHeader label="Retail $" field="retailPriceAvg" />
              <SortHeader label="Markup" field="markupPercent" />
              <SortHeader label="Critic" field="criticScore" />
              <SortHeader label="Community" field="communityScore" />
              <SortHeader label="Value" field="valueScore" />
              <th className="px-3 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((wine, i) => {
              const originalIndex = wines.indexOf(wine);
              const lowConfidence = wine.confidence < 0.8;
              return (
                <tr
                  key={i}
                  className={`hover:bg-gray-50 transition-colors ${lowConfidence ? 'bg-yellow-50' : ''}`}
                >
                  <td className="px-3 py-3">
                    <div className="text-sm font-medium text-gray-900">{wine.name}</div>
                    <div className="text-xs text-gray-500">{wine.producer}{wine.region ? ` \u00B7 ${wine.region}` : ''}</div>
                    {lowConfidence && (
                      <span className="text-xs text-yellow-600 font-medium">Low confidence - review</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-700">
                    {wine.vintage ?? 'NV'}
                  </td>
                  <td className="px-3 py-3 text-sm font-medium text-gray-900">
                    {sym}{wine.restaurantPrice}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-700">
                    {wine.retailPriceAvg !== null ? `${sym}${wine.retailPriceAvg}` : (
                      wine.lookupStatus === 'pending' && isLookingUp ? (
                        <span className="inline-block w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                      ) : wine.lookupStatus === 'not_found' ? (
                        <span className="text-xs text-gray-400">N/A</span>
                      ) : '--'
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {wine.markupPercent !== null ? (
                      <span className={wine.markupPercent > 200 ? 'text-red-600 font-medium' : wine.markupPercent < 100 ? 'text-green-600 font-medium' : 'text-gray-700'}>
                        {wine.markupPercent}%
                      </span>
                    ) : '--'}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-700">
                    {wine.criticScore !== null ? (
                      <a
                        href={wine.wineSearcherUrl ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-purple-600"
                      >
                        {wine.criticScore}
                      </a>
                    ) : '--'}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-700">
                    {wine.communityScore !== null ? (
                      <a
                        href={wine.cellarTrackerUrl ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-purple-600"
                      >
                        {wine.communityScore}
                        {wine.communityReviewCount && (
                          <span className="text-xs text-gray-400 ml-1">({wine.communityReviewCount})</span>
                        )}
                      </a>
                    ) : '--'}
                  </td>
                  <td className="px-3 py-3">
                    <ValueBadge score={wine.valueScore} />
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => setEditIndex(originalIndex)}
                      className="text-gray-400 hover:text-purple-600 transition-colors"
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

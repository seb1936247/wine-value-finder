import { useState } from 'react';
import type { WineValueResult } from '../types/wine.ts';

interface Props {
  wine: WineValueResult;
  index: number;
  onSave: (index: number, updates: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function EditWineModal({ wine, index, onSave, onClose }: Props) {
  const [name, setName] = useState(wine.name);
  const [producer, setProducer] = useState(wine.producer);
  const [vintage, setVintage] = useState(wine.vintage?.toString() ?? '');
  const [price, setPrice] = useState(wine.restaurantPrice.toString());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(index, {
      name,
      producer,
      vintage: vintage ? parseInt(vintage) : null,
      restaurantPrice: parseFloat(price),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Edit Wine</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Wine Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Producer</label>
            <input
              type="text"
              value={producer}
              onChange={e => setProducer(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vintage</label>
              <input
                type="text"
                value={vintage}
                onChange={e => setVintage(e.target.value)}
                placeholder="NV"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant Price ($)</label>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                step="0.01"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Original: {wine.rawText}
          </p>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 bg-purple-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              Save & Re-lookup
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

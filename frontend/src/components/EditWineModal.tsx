import { useState } from 'react';
import type { WineValueResult } from '../types/wine.ts';

interface Props {
  wine: WineValueResult;
  index: number;
  onSave: (index: number, updates: Record<string, unknown>) => void;
  onClose: () => void;
}

interface FormErrors {
  name?: string;
  vintage?: string;
  price?: string;
}

function validate(name: string, vintage: string, price: string): FormErrors {
  const errors: FormErrors = {};

  if (!name.trim()) {
    errors.name = 'Wine name is required.';
  }

  if (vintage) {
    const year = parseInt(vintage, 10);
    if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 1) {
      errors.vintage = 'Enter a valid year (1900-present).';
    }
  }

  const priceNum = parseFloat(price);
  if (isNaN(priceNum) || priceNum <= 0) {
    errors.price = 'Enter a valid price.';
  }

  return errors;
}

export default function EditWineModal({ wine, index, onSave, onClose }: Props) {
  const [name, setName] = useState(wine.name);
  const [producer, setProducer] = useState(wine.producer);
  const [vintage, setVintage] = useState(wine.vintage?.toString() ?? '');
  const [price, setPrice] = useState(wine.restaurantPrice.toString());
  const [errors, setErrors] = useState<FormErrors>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formErrors = validate(name, vintage, price);
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }
    onSave(index, {
      name,
      producer,
      vintage: vintage ? parseInt(vintage) : null,
      restaurantPrice: parseFloat(price),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card p-6 w-full max-w-md mx-4 shadow-xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-slate-900">Edit Wine</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Wine Name</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setErrors(prev => ({ ...prev, name: undefined })); }}
              className={`input-field ${errors.name ? 'border-red-400 focus:ring-red-400/40 focus:border-red-400' : ''}`}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Producer</label>
            <input
              type="text"
              value={producer}
              onChange={e => setProducer(e.target.value)}
              className="input-field"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Vintage</label>
              <input
                type="text"
                value={vintage}
                onChange={e => { setVintage(e.target.value); setErrors(prev => ({ ...prev, vintage: undefined })); }}
                placeholder="NV"
                className={`input-field ${errors.vintage ? 'border-red-400 focus:ring-red-400/40 focus:border-red-400' : ''}`}
              />
              {errors.vintage && <p className="text-xs text-red-500 mt-1">{errors.vintage}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Menu Price</label>
              <input
                type="number"
                value={price}
                onChange={e => { setPrice(e.target.value); setErrors(prev => ({ ...prev, price: undefined })); }}
                step="0.01"
                className={`input-field ${errors.price ? 'border-red-400 focus:ring-red-400/40 focus:border-red-400' : ''}`}
              />
              {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price}</p>}
            </div>
          </div>
          <p className="text-xs text-slate-400 truncate">
            Original: {wine.rawText}
          </p>
          <div className="flex gap-3 pt-1">
            <button type="submit" className="btn-primary flex-1">
              Save & Re-lookup
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState, useRef, type DragEvent } from 'react';

interface Props {
  onUpload: (file: File) => void;
  uploading: boolean;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      return 'Please upload a PDF, JPG, PNG, or WebP file.';
    }
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_SIZE_MB}MB.`;
  }
  return null;
}

export default function UploadZone({ onUpload, uploading }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const error = validateFile(file);
    if (error) {
      setFileError(error);
      return;
    }
    setFileError(null);
    onUpload(file);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleClick = () => inputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-3">
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          group card p-8 sm:p-16 text-center cursor-pointer
          transition-all duration-200
          ${dragOver
            ? 'border-wine-500 bg-wine-50 scale-[1.01] shadow-md'
            : 'hover:border-slate-300 hover:shadow-md'
          }
          ${uploading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={handleFileChange}
        />
        <div className="text-slate-500">
          {uploading ? (
            <>
              <div className="mx-auto w-12 h-12 mb-5 flex items-center justify-center">
                <div className="animate-spin w-10 h-10 border-[3px] border-wine-500 border-t-transparent rounded-full" />
              </div>
              <p className="text-lg font-semibold text-slate-800">Parsing wine list...</p>
              <p className="text-sm mt-1 text-slate-400">Claude is reading your menu</p>
            </>
          ) : (
            <>
              <div className="mx-auto w-16 h-16 mb-5 rounded-2xl bg-wine-50 flex items-center justify-center group-hover:bg-wine-100 transition-colors duration-200">
                <span className="text-3xl" role="img" aria-label="wine glass">🍷</span>
              </div>
              <p className="text-lg font-semibold text-slate-800">Drop a wine list here</p>
              <p className="text-sm mt-1.5 text-slate-400">PDF, JPG, PNG, or WebP &middot; max {MAX_SIZE_MB}MB</p>
              <p className="text-xs text-slate-300 mt-3 group-hover:text-slate-400 transition-colors">
                or click to browse
              </p>
            </>
          )}
        </div>
      </div>
      {fileError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm animate-fade-in">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{fileError}</span>
        </div>
      )}
    </div>
  );
}

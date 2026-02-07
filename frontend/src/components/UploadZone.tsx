import { useState, useRef, type DragEvent } from 'react';

interface Props {
  onUpload: (file: File) => void;
  uploading: boolean;
}

export default function UploadZone({ onUpload, uploading }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleClick = () => inputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
        transition-colors duration-200
        ${dragOver ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-gray-400 bg-white'}
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
      <div className="text-gray-500">
        {uploading ? (
          <>
            <div className="animate-spin inline-block w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mb-4" />
            <p className="text-lg font-medium">Parsing wine list...</p>
            <p className="text-sm mt-1">Claude is reading your menu</p>
          </>
        ) : (
          <>
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-medium">Drop a wine list here</p>
            <p className="text-sm mt-1">PDF, JPG, PNG, or WebP (max 20MB)</p>
            <p className="text-xs text-gray-400 mt-2">or click to browse</p>
          </>
        )}
      </div>
    </div>
  );
}

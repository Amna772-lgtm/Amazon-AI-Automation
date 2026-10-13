'use client';

import clsx from 'clsx';
import { UploadCloud } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { formatBytes } from '@/lib/format';

const ACCEPT = '.csv,.xlsx';
const MAX_BYTES = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 20) * 1024 * 1024;

/** Client-side pre-checks only; the API re-validates type (magic bytes) and size. */
export function validateUpload(file: File): string | null {
  if (!/\.(csv|xlsx)$/i.test(file.name)) return 'Only .csv and .xlsx files are supported.';
  if (file.size > MAX_BYTES) return `File is larger than ${formatBytes(MAX_BYTES)}.`;
  if (file.size === 0) return 'File is empty.';
  return null;
}

export function FileDropzone({ onFile, disabled }: { onFile(file: File): void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) pick(e.dataTransfer.files);
      }}
      onClick={() => !disabled && input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
      className={clsx(
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
        over ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-slate-400',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <UploadCloud className="mb-2 size-7 text-slate-400" />
      <p className="text-sm font-medium">Drop an Excel or CSV file here, or click to browse</p>
      <p className="mt-1 text-xs text-slate-500">
        Amazon product URLs are detected in any column. .xlsx or .csv, up to {formatBytes(MAX_BYTES)}.
      </p>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        data-testid="file-input"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

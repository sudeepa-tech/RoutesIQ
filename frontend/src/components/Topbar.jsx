import { useRef, useState } from 'react';
import { Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useTransportData } from '../hooks/useTransportData.jsx';

export default function Topbar({ title, subtitle }) {
  const { uploadWorkbook, loading, stats, error } = useTransportData();
  const [progress, setProgress] = useState(0);
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadWorkbook(file, setProgress);
    } finally {
      setProgress(0);
      e.target.value = '';
    }
  };

  return (
    <header className="h-16 shrink-0 border-b border-border bg-base/80 backdrop-blur px-6 flex items-center justify-between">
      <div>
        <h1 className="font-display text-lg font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {stats?.datasetLoaded ? (
          <div className="flex items-center gap-1.5 text-xs text-teal font-mono">
            <CheckCircle2 size={14} />
            {stats.riders.toLocaleString()} riders · {stats.vehicles} routes loaded
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-coral font-mono">
            <AlertCircle size={14} />
            No dataset loaded
          </div>
        )}

        <button
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-2 text-sm font-medium bg-amber text-base px-3.5 py-2 rounded-lg hover:brightness-110 active:brightness-95 transition disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              {progress > 0 ? `${progress}%` : 'Working…'}
            </>
          ) : (
            <>
              <Upload size={15} />
              Upload workbook
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {error && (
        <div className="absolute top-16 right-6 mt-2 bg-coral/10 border border-coral/40 text-coral text-xs px-3 py-2 rounded-lg font-mono max-w-sm">
          {error}
        </div>
      )}
    </header>
  );
}

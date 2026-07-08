import { FileSpreadsheet } from 'lucide-react';

export default function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-panel2 border border-border flex items-center justify-center">
        <FileSpreadsheet size={24} className="text-ink-faint" />
      </div>
      <h2 className="font-display font-medium text-ink">No transport data loaded</h2>
      <p className="text-sm text-ink-muted max-w-sm">
        Upload the institute's transport workbook (vehicle master + rider lat/long sheets)
        using the button in the top-right to populate the dashboard.
      </p>
    </div>
  );
}

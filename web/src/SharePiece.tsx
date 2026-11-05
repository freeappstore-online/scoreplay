import { useState } from 'react';

export function piecePath(id: string) { return `/?piece=${encodeURIComponent(id)}`; }

export function SharePiece({ id, title }: { id: string; title: string }) {
  const [visible, setVisible] = useState(false), [notice, setNotice] = useState('');
  const url = new URL(piecePath(id), location.origin).href;
  const share = async () => {
    setVisible(true); setNotice('');
    try {
      if (navigator.share) { await navigator.share({ title: `${title} — Scoreplay`, url }); setNotice('Link shared.'); }
      else { await navigator.clipboard.writeText(url); setNotice('Link copied.'); }
    } catch (error) {
      setNotice(error instanceof Error && error.name === 'AbortError' ? '' : 'Select and copy the link below.');
    }
  };
  return <div className="min-w-0 max-w-full">
    <button className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink hover:bg-panel" aria-label={`Share ${title}`} onClick={() => void share()}>Share ↗</button>
    {visible && <div className="mt-2 space-y-1"><label className="block text-xs text-muted">Link to {title}<input readOnly value={url} onFocus={e => e.currentTarget.select()} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-paper px-2 text-sm text-ink" /></label><p role="status" className="text-xs text-muted">{notice}</p></div>}
  </div>;
}

import { Badge, Card } from '@freeappstore/sdk/ui';
import { composerInfo } from './composers';
import { ComposerIdentity } from './ComposerIdentity';
import type { CatalogPiece } from './catalog';
import { formatTime } from './music';
import type { LibraryPreview, PreviewSource } from './library-preview';
import { PreviewButton } from './LibraryPreview';
import { SharePiece } from './SharePiece';
import { button, selectedButton } from './ui';

type Props = {
  piece: CatalogPiece; favorite: boolean; saved: boolean; disabled: boolean;
  loading: '' | 'open' | 'save'; error?: string; tags: string[];
  preview: LibraryPreview; previewSource: PreviewSource;
  onFavorite: () => void; onTag: (tag: string) => void;
  onOpen: () => void; onSave: () => void; onRetry: () => void;
};
export function CatalogCard({ piece, favorite, saved, disabled, loading, error, tags, preview, previewSource, onFavorite, onTag, onOpen, onSave, onRetry }: Props) {
  const portrait = composerInfo(piece.composer).portrait;
  return <Card className="min-w-0"><article className="flex h-full flex-col gap-4" aria-busy={!!loading}>
    <div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wider text-muted">{piece.category}</p><h2 className="mt-2 break-words text-xl">{piece.title}</h2><ComposerIdentity name={piece.composer} /></div><button className={`${favorite ? selectedButton : button} shrink-0 !px-3 text-xl`} aria-label={`Favourite ${piece.title}`} aria-pressed={favorite} onClick={onFavorite}>{favorite ? '★' : '☆'}</button></div>
    <div className="flex flex-wrap gap-2"><Badge>{piece.kind}</Badge><Badge>{piece.difficulty === 'Not rated' ? 'Difficulty not rated' : piece.difficulty}</Badge>{piece.assets.midi && <Badge>{formatTime(piece.duration)}</Badge>}</div>
    <p className="text-sm text-muted">{piece.instruments.join(' + ')}</p>
    <div className="flex flex-wrap gap-1.5">{piece.tags.slice(0, 4).map(t => <button key={t} className={`min-h-11 rounded-full border px-3 py-1 text-xs ${tags.includes(t) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-accent'}`} aria-pressed={tags.includes(t)} onClick={() => onTag(t)}>#{t}</button>)}{piece.tags.length > 4 && <span className="flex items-center text-xs text-muted">+{piece.tags.length - 4} tags in details</span>}</div>
    <p className="text-xs leading-5 text-muted">{!piece.assets.midi ? piece.playbackUnavailable : piece.assets.musicxml ? 'Original sheet music + PDF' : 'MIDI transcription + original PDF'}</p>
    <div className="mt-auto flex flex-wrap gap-2">{piece.assets.midi ? <>
      <PreviewButton preview={preview} disabled={disabled} source={previewSource} />
      <button className={`${button} border-accent text-accent`} disabled={disabled} onClick={onOpen} aria-label={`Open ${piece.title}`}>{loading === 'open' ? 'Opening…' : 'Open score'}</button>
      <button className={button} disabled={disabled || saved} onClick={onSave}>{loading === 'save' ? 'Saving…' : saved ? 'Saved to my files' : 'Save to my files'}</button>
      <SharePiece id={piece.id} title={piece.title} />
    </> : <a className={button} href={piece.assets.pdf} target="_blank" rel="noopener noreferrer" aria-label={`Open PDF ${piece.title}`}>Open PDF score ↗</a>}</div>
    {error && <div role="alert" className="rounded-xl border border-danger bg-danger-soft p-3 text-sm text-danger"><p>{error}</p><button className={`${button} mt-2`} disabled={disabled} onClick={onRetry}>Retry {piece.title}</button></div>}
    <details className="break-words border-t border-line pt-2 text-xs leading-5 text-muted"><summary className="min-h-11 cursor-pointer py-3 font-semibold">About, downloads & credits</summary><div className="mt-3 space-y-3">
      <p>{piece.description}</p>{piece.kind === 'Edition selection' && <p>One file from a multi-file edition. It may be a movement, part, or alternate version; the source does not identify it clearly.</p>}
      <div className="flex flex-wrap gap-2">{piece.tags.map(t => <button key={t} className={`${tags.includes(t) ? selectedButton : button} !px-3 !text-xs`} aria-pressed={tags.includes(t)} onClick={() => onTag(t)}>#{t}</button>)}</div>
      <p>{piece.edition}</p>{piece.creditsUrl && <a className="block text-accent underline" href={piece.creditsUrl} target="_blank" rel="noopener noreferrer">Edition files &amp; credits ↗</a>}
      {portrait && <p>Portrait: {portrait.artist}. {portrait.rights}. <a className="text-accent underline" href={portrait.sourceUrl} target="_blank" rel="noopener noreferrer">Image source ↗</a></p>}
      <p>{piece.rights} · <a className="text-accent underline" href={piece.rightsUrl} target="_blank" rel="noopener noreferrer">Rights details ↗</a></p><a className="block text-accent underline" href={piece.sourceUrl} target="_blank" rel="noopener noreferrer">{piece.source} ↗</a>
      <div className="flex flex-wrap gap-4">{piece.assets.midi && <a className="inline-flex min-h-11 items-center text-accent underline" href={piece.assets.midi} download={`${piece.title}.mid`}>Download MIDI</a>}<a className="inline-flex min-h-11 items-center text-accent underline" href={piece.assets.pdf} download={`${piece.title}.pdf`}>Download PDF</a>{piece.assets.musicxml && <a className="inline-flex min-h-11 items-center text-accent underline" href={piece.assets.musicxml} download={`${piece.title}.musicxml`}>MusicXML</a>}</div>
    </div></details>
  </article></Card>;
}

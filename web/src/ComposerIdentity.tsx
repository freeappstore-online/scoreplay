import { composerInfo } from './composers';
export function ComposerIdentity({ name }: { name: string }) {
  const composer = composerInfo(name);
  return <div className="mt-3 flex min-w-0 items-center gap-3">
    {composer.portrait ? <img src={composer.portrait.url} alt={`Portrait of ${composer.fullName}`} width={48} height={64} loading="lazy" className="h-16 w-12 shrink-0 rounded-lg border border-line object-cover object-top" /> : <span aria-hidden="true" className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg border border-line bg-panel text-xl text-muted">{name.startsWith('Traditional') ? '♫' : composer.label[0]}</span>}
    <p className="min-w-0 break-words text-sm text-muted">{composer.label}</p>
  </div>;
}

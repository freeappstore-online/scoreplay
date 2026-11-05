import { useEffect, useRef } from 'react';
import { useConnectedKvDraft } from '@freeappstore/sdk/hooks';
import { SignInButton } from '@freeappstore/sdk/ui';
import type { FreeAppStore } from '@freeappstore/sdk';
import { pwa } from '../fas-capabilities/pwa';

/** Keep the sign-in gate on this private-data feature, not on public app screens. */
export function ConnectedDraft({ app: fas }: { app: FreeAppStore }) {
  const draft = useConnectedKvDraft(fas, 'private-draft', '');
  const busy = useRef(false);
  busy.current = draft.dirty || draft.saving;
  useEffect(() => pwa.addBusyGuard(() => busy.current), []);

  if (!draft.user) {
    return (
      <section aria-labelledby="draft-title">
        <h2 id="draft-title">Private draft</h2>
        <p>Sign in to load or save your private draft. Public parts of the app remain available.</p>
        <SignInButton app={fas} />
      </section>
    );
  }

  return (
    <section aria-labelledby="draft-title">
      <h2 id="draft-title">Private draft</h2>
      {draft.loading ? <p role="status">Loading your draft…</p> : null}
      {draft.error ? (
        <p role="alert">
          {draft.error}{' '}
          <button type="button" onClick={draft.retry}>
            Retry
          </button>
        </p>
      ) : null}
      <label htmlFor="private-draft">Your notes</label>
      <textarea
        id="private-draft"
        style={{ display: 'block', boxSizing: 'border-box', width: '100%', minWidth: 0, maxWidth: '100%', resize: 'vertical' }}
        value={draft.draft}
        onChange={(event) => draft.setDraft(event.currentTarget.value)}
      />
      <button
        type="button"
        disabled={!draft.dirty || draft.saving}
        onClick={() => void draft.save()}
      >
        {draft.saving ? 'Saving…' : 'Save'}
      </button>
      {draft.dirty ? <span>Unsaved changes</span> : null}
    </section>
  );
}

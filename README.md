# Scoreplay

A simple, private MIDI player: open a `.mid` / `.midi`, watch the piano roll, and practise with speed, volume, track-mute and whole-piece loop controls.

- Live: https://scoreplay.freeappstore.online
- Install: `pnpm install`
- Develop: `pnpm dev`
- Validate: `pnpm typecheck && pnpm test && pnpm build`
- Browser checks: `pnpm exec playwright test` (installs Chromium with `pnpm exec playwright install chromium`)
- Deploy: push directly to `main`.

MIDI files are parsed locally using @tonejs/midi. The last imported file is stored in IndexedDB and can be removed from the player. Playback uses Web Audio with a synthesized tone and basic percussion; there is no soundfont download. Tempo changes, polyphony, note velocity and sustain pedal are supported. Pitch bends, other controllers, sheet-music engraving and note editing are outside this version's scope. Limits: 5 MB, 100,000 notes, two hours, 256 simultaneous voices. MIDI format 0 and 1 using PPQ timing are supported.

The bundled demo is an arrangement of Beethoven's public-domain Ode to Joy. Free, MIT licensed, no ads or tracking.

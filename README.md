# Scoreplay

A simple, private MIDI player: open a `.mid` / `.midi`, read the sheet music or watch the piano roll, and practise with speed, volume, track-mute and whole-piece loop controls.

- Live: https://scoreplay.freeappstore.online
- Install: `pnpm install`
- Develop: `pnpm dev`
- Validate: `pnpm typecheck && pnpm test && pnpm build`
- Browser checks: `pnpm exec playwright test` (installs Chromium with `pnpm exec playwright install chromium`)
- Deploy: push directly to `main`.

MIDI files are parsed locally using @tonejs/midi. The last imported file is stored in IndexedDB and can be removed from the player. Playback uses Web Audio with a synthesized tone and basic percussion; there is no soundfont download. Tempo changes, polyphony, note velocity and sustain pedal are supported. Sheet music is generated as MusicXML and engraved with OpenSheetMusicDisplay, loaded on demand. It supports combined/individual melodic tracks, automatic treble/bass staves, meter changes, rests, tied chords, rhythm quantization and a playback cursor. MIDI does not preserve original notation: key spelling (sharps), beaming, quantization and hand allocation are approximations. Percussion appears in the piano roll. Pitch bends, other controllers and note editing are outside this version's scope. Limits: 5 MB, 100,000 notes, two hours, 256 simultaneous voices. MIDI format 0 and 1 using PPQ timing are supported.

The bundled demo is an arrangement of Beethoven's public-domain Ode to Joy. Free, MIT licensed, no ads or tracking.

## Library and original scores

Open Library to import up to 100 arrangements. Select MIDI, uncompressed partwise MusicXML and PDF files together; matching basenames pair automatically. MIDI/MusicXML are limited to 5 MB per file and PDFs to 20 MB. Reimporting the same basename updates that entry and retains existing attachments. Imports are validated before an atomic IndexedDB write. Remove an arrangement to clear its library files and matching last-opened snapshot.

A paired MusicXML score is shown as its original notation, with measure paging and optional MIDI timing following. Repeats or different arrangements can make score and MIDI timing diverge. PDF scores use the browser PDF viewer with a separate-tab fallback. The MIDI transcription remains available.

The free collection bundles 60 public-domain editions: 24 nursery songs and 36 classical/traditional pieces. All have MIDI and original PDF; nursery songs also have MusicXML. Sources, rights links, original download URLs, verification dates and SHA-256 hashes are recorded in `web/src/catalog-data.json`. Mutopia editions are explicitly public-domain dedications. The 1878 nursery collection is from Project Gutenberg's *The Baby’s Bouquet*, arranged by Lucy Crane (1842–1882), transcribed by Linda Cantoni; the source terms are retained in `web/public/music/gutenberg-license.txt`.

Search is accent-insensitive and matches all words across titles, composers and tags. Filters combine category, estimated difficulty, instrument, composer, duration, original MusicXML and multiple tags. Sort by title, composer, length or difficulty. Favourites and filters persist locally. Assets load on demand; Save to my files stores MIDI and scores in IndexedDB for reuse without another download. The app shell must have been cached for offline navigation. User imports are never uploaded or included in the public catalog. No paid sources or Disney downloads are bundled.

Run `node scripts/sync-catalog.mjs` to re-fetch exact source assets and verify their pinned hashes. `pnpm test` validates every bundled MIDI, PDF and MusicXML, and catalog integrity. Changes to the catalog require reviewing source rights and updating pinned metadata deliberately.

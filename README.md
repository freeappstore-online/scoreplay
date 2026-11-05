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

The Disney discovery catalog contains metadata and verified links, **not bundled Disney MIDI or scores**. Sources checked 2026-11-05: [Belle, Musicnotes](https://www.musicnotes.com/sheetmusic/beauty-and-the-beast/belle/MN0057057), [Let It Go, Hal Leonard](https://www.halleonard.com/product/140822/let-it-go), and [Disney Goes Classical, Hal Leonard](https://www.halleonard.com/product/354996/disney-goes-classical). Users import files they have separately. Local imports are never published to the repository or uploaded by the app.

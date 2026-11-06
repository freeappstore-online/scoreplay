# Scoreplay

A simple, private MIDI player: open a `.mid` / `.midi`, read the sheet music or watch the piano roll, and practise with speed, volume, track-mute and whole-piece loop controls.

- Live: https://scoreplay.freeappstore.online
- Install: `pnpm install`
- Develop: `pnpm dev`
- Validate: `pnpm typecheck && pnpm test && pnpm build`
- Browser checks: `pnpm exec playwright test` (installs Chromium with `pnpm exec playwright install chromium`)
- Deploy: push directly to `main`.

MIDI files are parsed locally using @tonejs/midi. The last imported file is stored in IndexedDB and can be removed from the player. Playback uses SpessaSynth 4.4.5 in an AudioWorklet with a self-hosted GeneralUser GS 2.0.3 sample bank. The sound bank is a bundled static asset, automatically precached with the app and verified against a pinned SHA-256 digest when loaded. Original instruments follows MIDI program numbers; Grand piano overrides melodic tracks while preserving percussion. Simple tones remains available as a lightweight fallback. All modes use Web Audio. Tempo changes, polyphony, note velocity and sustain pedal are supported. Sheet music is generated as MusicXML and engraved with OpenSheetMusicDisplay, loaded on demand. It supports combined/individual melodic tracks, automatic treble/bass staves, meter changes, rests, tied chords, rhythm quantization and a playback cursor. MIDI does not preserve original notation: key spelling (sharps), beaming, quantization and hand allocation are approximations. Percussion appears in the piano roll. Pitch bends, other expressive controllers and note editing are outside this version's scope. Limits: 5 MB, 100,000 notes, two hours, 256 simultaneous voices. MIDI format 0 and 1 using PPQ timing are supported.

The bundled demo is an arrangement of Beethoven's public-domain Ode to Joy. Free, MIT licensed, no ads or tracking.

## Library and original scores

Open Library to import up to 100 arrangements. Select MIDI, uncompressed partwise MusicXML and PDF files together; matching basenames pair automatically. MIDI/MusicXML are limited to 5 MB per file and PDFs to 20 MB. Reimporting the same basename updates that entry and retains existing attachments. Imports are validated before an atomic IndexedDB write. Remove an arrangement to clear its library files and matching last-opened snapshot.

A paired MusicXML score is shown as its original notation, with measure paging and optional MIDI timing following. Repeats or different arrangements can make score and MIDI timing diverge. PDF scores use the browser PDF viewer with a separate-tab fallback. The MIDI transcription remains available.

The collection covers all **2,123 editions** in Mutopia's published index as reviewed on 2026-11-06, plus **60 nursery songs** from Project Gutenberg. It contains **5,257 playable pieces, movements and instrumental parts**, plus **four PDF-only editions** whose upstream MIDI links are unavailable. All twelve movements of Vivaldi's *The Four Seasons* are included. Twenty original MIDI files contain no playable notes; these remain available in their edition downloads but do not appear as playable search results.

Mutopia editions are public domain or freely licensed under CC BY / CC BY-SA (versions 2.0–4.0 as specified by each edition). The original files and notices are unchanged. Every edition has a local credits page linked from the player and the library’s “Edition files & credits” link with its original MIDI files, all A4 PDFs/parts, editable LilyPond source, named contributor credits and license link. These music licenses apply to the files separately from the app's MIT license. `scripts/mutopia-provenance.json` pins all 10,568 upstream files/members with SHA-256 hashes; `scripts/mutopia-coverage.json` records complete coverage and source exceptions. Three broken upstream MIDI filenames were resolved against their official directories.

The nursery scores include MIDI, original MusicXML and PDF. They come from *The Baby’s Bouquet* and *The Baby’s Opera*, transcribed by Linda Cantoni. Their source terms are retained in `web/public/music/gutenberg-license.txt` and `gutenberg-opera-license.txt`. New additions include Baa, Baa, Black Sheep; Jack and Jill; Three Blind Mice; Hickory Dickory Dock; Little Bo-Peep; and Rock-a-Bye Baby.

Search is accent-insensitive and matches all words across titles, composers and tags. Filters combine category, estimated difficulty, instrument, composer, duration, original MusicXML and multiple tags. Sort by title, composer, length or difficulty. Favourites and filters persist locally. Assets load on demand; Save to my files stores MIDI and scores in IndexedDB for reuse without another download. The app shell must have been cached for offline navigation. User imports are never uploaded or included in the public catalog. No paid sources or Disney downloads are bundled.

Run `node scripts/sync-catalog.mjs` to re-fetch exact source assets and verify their pinned hashes. `pnpm test` validates every bundled MIDI, PDF and MusicXML, and catalog integrity. Changes to the catalog require reviewing source rights and updating pinned metadata deliberately.

## Sampled playback

The sound engine and its worklet are lazy-loaded. The app automatically precaches their JavaScript and the 8 MB static instrument bank for offline use, including before the first play. Instrument audio is built in; there is no separate sound-pack setup. Imported MIDI stays on the device. Cancellation stops pending playback. Loading failures offer retry and an explicit Simple tones option. A browser that cannot cache assets can still play online.

A normalized playback sequence preserves parsed note times, velocities, sustain extensions and instrument programs. It uses separate MIDI channels/ports for each track, including independent percussion tracks. Seeking, speed changes and muting rebuild the audible remainder, including notes held across the seek position. Timing runs in the audio worklet; notation follows the same tempo-resolved note timeline. This version does not pass through pitch-bend or additional expressive controller events.

GeneralUser GS by S. Christian Collins is freely redistributable under its included terms (`web/public/sounds/GeneralUser-LICENSE.txt`), not public domain. SpessaSynth is Apache-2.0; its license is included separately. The app remains MIT licensed. `web/src/sound-bank.json` records the pinned upstream revision, source hash, packaged hash and conversion details. `scripts/build-sound-bank.mjs` verifies the source and converts it to SF3 using ffmpeg with libvorbis quality 5; set `SCOREPLAY_FFMPEG` when using a non-default binary. Conversion is lossy audio compression; the instrument mappings, sample loops and envelopes are retained. Rebuilding with another encoder version can change the packaged hash.

Original MusicXML follows playback by default with a note cursor and automatic pages. Page ranges use source-measure indices so pickup measures are retained. The parsed score is reused while paging. Timing still assumes the MIDI and score describe the same arrangement; repeat expansion can differ.

Composer names are displayed and sorted surname first while retaining the original catalog identifiers for saved filters. `web/src/composer-data.json` records the sources, public-domain status and hashes of 25 bundled portrait thumbnails. Horetzky and Petzold use initials because no verified portrait was found; traditional pieces use a music symbol. Portraits are static assets included in the offline cache.


## Sharing and discovery

Each playable free piece has a stable link, such as `/?piece=nursery-aikendrum`. Share uses the device share sheet or copies the URL, with a selectable link if the browser denies access. Direct links load the matching MIDI and score without autoplay or sign-in, and support reload and browser history. Saved catalog files can reopen offline. Personal imports never get public links; replacing any catalog file with an import clears its public provenance.

Composer shortcuts reset conflicting filters and open the full collection. Shelf selection uses a solid contrasting fill and checkmark; empty favourites can search the entire free collection without losing the composer filter. Indexed composer names are presented surname first, with full names where verified from the source. Existing portraits are retained; other composers use an initials fallback. Unassessed editions use “Not rated”, rather than an invented difficulty. Collection parts may have a full-edition or part PDF; the selected filename is stated and all alternatives are available on the edition page.

`node scripts/sync-catalog.mjs [piece-id ...]` also supports ZIP-backed editions using Python 3's standard library; shared archives are fetched once per run. Omitting IDs verifies the full catalog. The browser receives ordinary static MIDI/PDF assets and needs no ZIP support.


## Search-result previews and library scaling

Preview buttons play MIDI directly in the free collection, favourites and saved-file results. Only one preview plays at a time. A persistent play/pause/stop bar remains available while filtering. Leaving Library, opening a score, or cancelling a pending preview stops it. Previews never replace the selected document or last-opened file; returning to Player restores its position, speed, loop, mute and volume settings, paused.

`LibraryPreview` temporarily borrows the existing `Player`, so preview and full playback share one AudioContext and sampled-instrument engine. Audio is unlocked in the initiating click before asynchronous MIDI fetching. Aborted or superseded downloads cannot start late. MIDI alone is fetched for previews; PDFs and MusicXML load only when opening or saving a piece. A saved catalog copy can preview offline. Errors support retry without navigation.

The catalog module is lazy-loaded for Library and shared links, with precomputed search text and filter options. Result calculations are memoized; transport progress updates only the preview bar, not the search results. Reading a known saved piece uses an IndexedDB key lookup instead of loading the whole saved library. The PWA caches app JavaScript, portraits and the shared sound bank; it does not precache all music or score files. Catalog growth increases hosted static storage and small searchable metadata, not simultaneous playback engines or downloaded score files.

The browser catalog is generated by `pnpm catalog:prepare`: repeated edition metadata is stored once and verification hashes/upstream archive details stay outside the app bundle. Its JSON is approximately 300 KB gzipped. The approximately 800 MB original-file collection is explicitly excluded from PWA precaching, including the edition HTML pages. Only selected music files are requested; the UI initially renders twelve results.

## Updating the complete Mutopia snapshot

The optional importer requires Python 3, `requests`, and `beautifulsoup4`. Use a fresh cache directory for a fresh upstream review:

```sh
python3 scripts/fetch-mutopia.py --cache /tmp/scoreplay-mutopia
python3 scripts/import-mutopia.py --index /tmp/scoreplay-mutopia/index.json --cache /tmp/scoreplay-mutopia/assets --output /tmp/scoreplay-review
node scripts/measure-catalog.mjs /tmp/scoreplay-review/catalog.json
```

Review download errors, `problems.json`, edition licenses/credits, PDF pairing overrides, and the generated metadata before replacing `web/src/catalog-data.json` and `scripts/mutopia-provenance.json`. Known silent files are pinned in `scripts/mutopia-silent-files.json`; changed bytes require another review. The four source-only editions remain visible with PDF links and an explicit explanation, without preview or misleading zero-length playback. After accepting the metadata, run `pnpm catalog:prepare`, typecheck, tests, build, and browser checks. No bulk asset downloads occur in the user's browser.

## Quality and publication safeguards

Library search comes first. Collection shortcuts include easy solo piano and recognisable melodies; advanced filters and composer shortcuts expand on demand. Active filters remain visible as removable chips. Arrangement labels are conservative: explicitly identified movements and instrumental parts are separated, while unidentified archive members remain “Edition selection”, never guessed complete works. `scripts/catalog-kind.mjs` supplies these presentation labels without changing original files or stable piece IDs.

Catalog and saved copies use one favourite identity. Opening a downloaded catalog piece from free results or favourites reuses its local score files, just like preview. Missing server files, server outages and connection failures have distinct messages. Failed opens/saves have a retry beside the affected card. Shared button styles cover player selections, library actions and previews in both themes.

The app deploy workflow uses `scripts/publish-dist.py` instead of syncing directly over live entry points. It compares local content digests with R2 single-part ETags, uploads and verifies changed dependencies first, publishes the page next, and publishes the service worker last. Existing assets are retained for open tabs. The full music archive is not retransferred merely because a new checkout has newer timestamps. Unknown/multipart ETags are conservatively uploaded again. Run `python3 -m unittest discover -s scripts -p 'test_*.py'` to exercise failed-upload ordering, same-size content changes, and retention.

This protects the reported missing-new-asset window in Scoreplay. It is not platform-wide atomic release switching: changed files at stable URLs can still change before the page, and a failed service-worker publication leaves the prior offline version active. Platform release prefixes, rollback and garbage collection remain tracked at https://github.com/freeappstore-online/platform/issues/510.

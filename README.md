# Bandersnatch Player for Jellyfin

A standalone web app that logs into your Jellyfin server, finds your
Bandersnatch file automatically, and plays it back as a branching
interactive experience — choices, countdown timer, jump cuts and all.
Runs in any browser on any device on your network; no Jellyfin plugin
or native app changes required.

## How it works

- It's a static site (`index.html` / `style.css` / `app.js` /
  `segment-engine.js`) plus two data files: `segment-map.js` (raw
  timestamps for every segment in the file) and `story-data.js` (the
  actual branching logic — preconditions, segment groups, per-segment
  choice moments with real on-screen button text, and initial story
  state).
- On play, it calls Jellyfin's `PlaybackInfo` endpoint to get a
  direct-play or transcoded stream URL for the item, same as
  Jellyfin's own web client would.
- `segment-engine.js` is a faithful port of the real branching
  algorithm — see **"The branching engine..."** section below for how
  it actually resolves choices and why.

## Running it

This is just static files — any web server works:

```bash
cd bandersnatch-player
python3 -m http.server 8080
```

Then open `http://<this-machine's-ip>:8080` from any device's
browser. For convenience you can also host it as a folder under your
Jellyfin server's reverse proxy, or on a Raspberry Pi / NAS / small
VPS — anywhere reachable by the devices you want to watch on.

**Add to home screen** on a phone/tablet for an app-like icon.

## Player controls

- **Space** / **K** — play/pause
- **&larr; / &rarr;** — skip back/forward 10s (correctly re-syncs the branching engine)
- **&uarr; / &darr;** — volume up/down
- **M** — mute
- **F** — fullscreen (or the button, or double-click the video)
- Drag the progress bar to scrub anywhere in the file
- Controls auto-hide after a few seconds of inactivity while playing,
  same as any normal video player — move the mouse (or tap, on
  touch) to bring them back. They stay visible while paused or during
  a choice.

## The branching engine: what it actually does

The engine was rewritten once already after the first version got
progression wrong. That first version picked branches with a weighted
random function over `SegmentMap`'s `next` map — which turned out to
be **incorrect**: the `weight` values aren't consulted by real
playback logic at all. Checked against a public-domain reference
client built against this same data, the real algorithm is:

- Choice timing comes from `bandersnatch.js`'s `momentsBySegment`
  (each moment's own `startMs`/`endMs`), not `SegmentMap`'s
  `interactionZones` — those are a coarser, less precise stand-in.
- Picking an option resolves to a specific segment via a
  **precondition-gated, ordered list** (`segmentGroups`) — the first
  entry whose precondition passes wins. It is not random. This is the
  mechanism behind "remembered" choices quietly changing later scenes
  (e.g. accepting the job once means you won't be offered it the same
  way again).
- A small persistent-state object (seeded from `bandersnatch.js`'s
  `stateHistory`) tracks these preconditions across the whole
  playthrough, updated via each moment/choice's `impressionData`.
- Some choices cut the instant you click; others
  (`config.disableImmediateSceneTransition`) wait until the segment
  naturally finishes playing the "buffer" footage after your pick.

`segment-engine.js` ports this faithfully — see the comments at the
top of that file for the full model. `story-data.js` (generated from
`bandersnatch.js`) carries the data this depends on: preconditions,
segment groups, per-segment moments, and initial state.

**A note on loops**: some playthroughs genuinely loop forever unless
you pick differently — e.g. repeatedly choosing "GO BACK" in Colin's
flat traps you until you pick "FOLLOW COLIN" instead. That's the real
film's design, not a bug.

`test-engine.js` is a headless simulation (`node test-engine.js`) that
drives the engine through several full playthroughs without a
browser — useful for verifying the engine after editing `story-data.js`
or `segment-engine.js` yourself.

## First run

1. Enter your Jellyfin server address (e.g. `http://192.168.1.50:8096`).
2. Log in with your normal Jellyfin username/password.
3. It automatically searches your library for "Bandersnatch" and
   shows a poster popup — no item ID or manual lookup needed. If it
   can't find an exact match (e.g. you titled the file differently),
   a simple search box appears instead.
4. Hit **Begin the Experience**.

Your server address and login are remembered (localStorage) so this
is a one-time setup per browser/device.

## CORS

Since this app calls the Jellyfin API from a different origin (a
different port/host than Jellyfin itself), your Jellyfin server needs
to allow it. Two options:
- **Reverse proxy** the app under the same domain as Jellyfin (e.g.
  `/bandersnatch/` alongside Jellyfin on the same nginx/Caddy host) —
  simplest, no CORS involved at all.
- Or enable CORS in Jellyfin: Dashboard → Networking, and make sure
  cross-origin requests are permitted (Jellyfin allows all origins by
  default in recent versions; older versions may need a reverse-proxy
  header adjustment).

## Known limitations

- Session reporting to Jellyfin ("now playing") is best-effort and
  silently ignored if it fails — it won't block playback.
- Netflix's CDN image references were deliberately stripped out of
  `story-data.js` at generation time — this player only ever shows
  text and video freeze-frames, never hotlinked Netflix assets.

## Fixing "video freezes but audio keeps playing" on branch cuts

This is a keyframe alignment issue, not a bug in the app itself:
seeking to a timestamp that isn't a keyframe means the decoder has to
wait for the next keyframe before it can show a correct frame, while
audio has no such restriction — so audio visibly moves ahead for a
moment. If your file wasn't authored (or concatenated) with a
keyframe at every branch point, you'll see this on cuts.

Run:
```bash
node generate-keyframe-fix.js > reencode.sh
```
This reads every branch-point timestamp out of `segment-map.js` and
writes an `ffmpeg` command that forces a keyframe at each one (video
re-encoded, audio stream-copied). Edit the `INPUT`/`OUTPUT` paths at
the top of `reencode.sh`, then run it. Point Jellyfin at the new file
afterward. It's a full re-encode so expect it to take a while
depending on your hardware — `-preset medium -crf 18` is a reasonable
quality/speed balance; adjust as you like.

## What changed since the first version

- **Full resolution**: the original `DeviceProfile` sent to Jellyfin
  was too narrow (missed `matroska` as a container name, among other
  gaps), so a lot of setups were silently falling back to a low-quality
  transcode. It's now much more permissive and should direct-play a
  standard H.264/AAC MKV at full quality.
- **Real choice text**: labels ("ACCEPT"/"REFUSE", "PHAEDRA"/"THE
  BERMUDA TRIANGLE", etc.) are now pulled from `bandersnatch.js`'s
  `momentsBySegment` + `segmentGroups` data instead of showing
  "Option 1/2".
- **Freeze-on-seek**: every branch/scrub now pauses, waits for the
  browser's real `seeked` event, and only then resumes — this alone
  fixes most of the audio/video desync. See above for the deeper
  keyframe-alignment fix if it persists.
- **Scrubbing**: the progress bar is now draggable (click or
  click-and-drag), plus 10s back/forward buttons — both correctly
  re-sync the branching engine to whichever segment owns the new
  timestamp.
- **Subtitles**: any subtitle tracks Jellyfin reports for the file now
  show up in a dropdown in the player controls.
- **Branching logic**: completely rewritten from a weighted-random
  guess to a faithful port of the real precondition/state-based
  algorithm — see "The branching engine: what it actually does" above.


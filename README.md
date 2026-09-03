# Bandersnatch Player for Jellyfin

A standalone web app that logs into your Jellyfin server, finds your
Bandersnatch file automatically, and plays it back as a branching
interactive experience — choices, countdown timer, jump cuts and all.
Runs in any browser on any device on your network; no Jellyfin plugin
or native app changes required.

## How it works

- It's a static site (`index.html` / `style.css` / `app.js` /
  `segment-engine.js`) plus two data files: `segment-map.js` (the
  branching graph — segment IDs, timestamps, which choice leads
  where) and `choice-labels.js` (human-readable button text per
  choice, generated with placeholder labels — see **Customizing
  labels** below).
- On play, it calls Jellyfin's `PlaybackInfo` endpoint to get a
  direct-play or transcoded stream URL for the item, same as
  Jellyfin's own web client would.
- `segment-engine.js` watches the video's `timeupdate` event. At real
  choice points it shows the overlay with a countdown; if you don't
  pick, it falls back to the branch Netflix's own player would have
  auto-selected. At the ~67 "silent" branch points in the graph (no
  UI, just narrative variety) it jump-cuts automatically, same as the
  source material does.

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

## Customizing choice labels

`choice-labels.js` ships with generic labels ("Option 1", "Option 2")
because the segment map doesn't include the literal on-screen wording
— that lives in Netflix's client-side copy, not in this data. Open
the file and fill in real button text as you spot each choice while
testing playback (the on-screen readout in the top-right of the
player shows the current segment ID to make this easy):

```js
"2G": {
  "title": "Which Record?",
  "options": [
    { "target": "1R", "label": "Thompson Twins" },
    { "target": "1S", "label": "Now 2" }
  ]
}
```

## Known limitations

- The branching logic uses `segment-map.js`'s graph (timestamps +
  weighted random branches + `defaultNext`). It does **not**
  reproduce Netflix's much deeper narrative-state engine from
  `bandersnatch.js` (preconditions, "remembered" choices affecting
  later scenes, respawn logic) — that's a large additional project on
  top of this if you want full parity.
- Direct-play works best if your file is already H.264/AAC in an MKV
  container; more exotic codecs will fall back to server-side
  transcoding via HLS (needs a reasonably capable Jellyfin server).
- Session reporting to Jellyfin ("now playing") is best-effort and
  silently ignored if it fails — it won't block playback.

# Making Jellyfin redirect to this player

Clicking Bandersnatch inside Jellyfin's own interface — details page, or
playing it directly from a home row — will send you straight to the
interactive player instead of Jellyfin's native video player.

This uses **Custom Javascript**, a community plugin that lets you paste
arbitrary JS to be injected into Jellyfin Web, without hand-editing
Jellyfin's own files (which would just get overwritten on every update).

## 1. Host the player somewhere with a public URL

GitHub Pages is a good fit — free static hosting, works from any device:

1. Push the `bandersnatch-player/` folder to a GitHub repo.
2. Repo Settings → Pages → deploy from the branch/folder containing it.
3. You'll get a URL like `https://yourusername.github.io/bandersnatch-player/`.

**Important:** the player calls your Jellyfin server's API directly from
the browser, so your Jellyfin server needs to be reachable from wherever
you'll be using the player — fine on your home network, but if you want
this to work outside your house too, your Jellyfin server needs to be
exposed to the internet (reverse proxy + HTTPS is the standard way) and
CORS needs to allow the GitHub Pages origin. If the player will only
ever be used at home, this isn't a concern.

## 2. Install the Custom Javascript plugin

1. Jellyfin Dashboard → Plugins → Repositories → **+**
2. Repository name: `Custom Javascript` (or anything)
3. Repository URL:
   ```
   https://raw.githubusercontent.com/johnpc/jellyfin-plugin-custom-javascript/refs/heads/main/manifest.json
   ```
4. Save → go to the **Catalog** tab → find **Custom Javascript** → Install
5. Restart Jellyfin

*(Docker users: if Jellyfin logs a permissions error writing to
`index.html` after this, see the plugin's own README for the
volume-mapping workaround — it's a one-time fix.)*

## 3. Find your Bandersnatch item ID

1. In Jellyfin Web, click into the Bandersnatch item so you're on its
   details page.
2. Look at the address bar — you'll see `...details?id=XXXXXXXX...`.
   Copy that ID exactly.

## 4. Configure the redirect

1. Dashboard → Plugins → **Custom Javascript**
2. Open `jellyfin-redirect-script.js` from this project, fill in:
   - `BANDERSNATCH_ITEM_ID` — the ID from step 3
   - `BANDERSNATCH_PLAYER_URL` — your GitHub Pages URL from step 1
3. Paste the whole script into the plugin's textarea, Save.
4. Hard-refresh Jellyfin Web (Ctrl/Cmd+Shift+R) on any device you want
   this to affect.

Now clicking into Bandersnatch anywhere in Jellyfin Web — details page,
a "Continue Watching" tile, search results — bounces you straight to
the interactive player.

## Notes / limitations

- This affects **Jellyfin Web** (browser-based clients) only. Native
  mobile/TV apps have their own separate UI code and this script never
  runs there.
- It's a substring match on the item ID appearing anywhere in the URL,
  which is why it works whether you click the details page, hit Play
  from a home shelf, etc. — but if your Jellyfin version's routing ever
  puts that same ID string somewhere unrelated (very unlikely), it'd
  also redirect there.
- The redirect happens client-side after the native page starts
  loading, so there may be a brief flash of Jellyfin's UI before it
  jumps — normal and harmless.
- First visit to the GitHub Pages player will ask you to log into
  Jellyfin again, since it's a different origin and can't see
  Jellyfin Web's own login session.

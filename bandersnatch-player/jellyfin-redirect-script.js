/**
 * Bandersnatch redirect for Jellyfin Web
 * ---------------------------------------------------------------
 * Paste this into the "Custom Javascript" plugin's config textarea
 * (Dashboard -> Plugins -> Custom Javascript). It watches for you
 * opening the Bandersnatch item — details page, direct play from a
 * home row, anywhere — and immediately sends you to the interactive
 * player instead of letting Jellyfin's native player load.
 *
 * SETUP — fill in these two lines:
 */
const BANDERSNATCH_ITEM_ID = "PASTE-YOUR-ITEM-ID-HERE";
const BANDERSNATCH_PLAYER_URL = "https://yourusername.github.io/bandersnatch-player/";

/**
 * How to find your item ID:
 *   1. In Jellyfin Web, click into the Bandersnatch item so you're on
 *      its details page.
 *   2. Look at the browser address bar. You'll see something like:
 *        .../details?id=3ec12aa978c1e8ea476b689d95504b1b
 *      (or a dashed GUID on some versions, e.g. 3ec12aa9-78c1-...)
 *   3. Copy everything after `id=` (and before any `&`) into
 *      BANDERSNATCH_ITEM_ID above, exactly as it appears.
 */

(function () {
  if (!BANDERSNATCH_ITEM_ID || BANDERSNATCH_ITEM_ID.includes("PASTE-YOUR")) return;

  let redirected = false;
  function checkAndRedirect() {
    if (redirected) return;
    if (location.href.includes(BANDERSNATCH_ITEM_ID)) {
      redirected = true;
      location.replace(BANDERSNATCH_PLAYER_URL);
    }
  }

  // Jellyfin Web is a single-page app — index.html loads once and the
  // URL changes internally afterwards (sometimes via pushState, which
  // doesn't fire any event we can listen to reliably across versions).
  // Polling location.href is the one approach that works the same way
  // regardless of which router/version is in use.
  checkAndRedirect();
  setInterval(checkAndRedirect, 400);
  addEventListener("popstate", checkAndRedirect);
  addEventListener("hashchange", checkAndRedirect);
})();

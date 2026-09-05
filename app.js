/* =====================================================================
   App state + small persistence layer
   ===================================================================== */
const LS_KEY = 'bsp.session';

function loadSession() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}
function saveSession(patch) {
  const cur = loadSession();
  localStorage.setItem(LS_KEY, JSON.stringify({ ...cur, ...patch }));
}
function clearSession() { localStorage.removeItem(LS_KEY); }

let session = loadSession();
if (!session.deviceId) {
  session.deviceId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
  saveSession({ deviceId: session.deviceId });
}

const APP_NAME = 'BandersnatchPlayer';
const APP_VERSION = '1.0.0';

/* =====================================================================
   Jellyfin API helper
   ===================================================================== */
function authHeader() {
  return `MediaBrowser Client="${APP_NAME}", Device="Web", DeviceId="${session.deviceId}", Version="${APP_VERSION}"`;
}

async function jf(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  headers['X-Emby-Authorization'] = authHeader();
  if (auth && session.token) headers['X-Emby-Token'] = session.token;
  const res = await fetch(session.server.replace(/\/+$/, '') + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function imageUrl(itemId, type = 'Primary') {
  return `${session.server.replace(/\/+$/, '')}/Items/${itemId}/Images/${type}?api_key=${session.token}`;
}

/* =====================================================================
   Tiny terminal "typing" effect
   ===================================================================== */
function typeLines(el, lines, { speed = 16, pause = 260 } = {}) {
  return new Promise(async (resolve) => {
    el.textContent = '';
    for (const line of lines) {
      let out = '';
      for (const ch of line) {
        out += ch;
        el.textContent = out;
        await sleep(speed);
      }
      el.textContent += '\n';
      await sleep(pause);
    }
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    el.appendChild(cursor);
    resolve();
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* =====================================================================
   Screen management
   ===================================================================== */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* =====================================================================
   SCREEN 1 — Connect
   ===================================================================== */
const bootLog = document.getElementById('boot-log');
const formConnect = document.getElementById('form-connect');
const inputServer = document.getElementById('input-server');
const errorConnect = document.getElementById('error-connect');

async function initConnectScreen() {
  await typeLines(bootLog, [
    'TUCKERSOFT REMOTE TERMINAL v1.0',
    'MEMORY CHECK.......... OK',
    'AWAITING SERVER ADDRESS_',
  ]);
  formConnect.classList.remove('hidden');
  if (session.server) inputServer.value = session.server;
  inputServer.focus();
}

formConnect.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorConnect.textContent = '';
  const btn = formConnect.querySelector('button');
  btn.disabled = true;
  let server = inputServer.value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(server)) server = 'http://' + server;
  try {
    const res = await fetch(server + '/System/Info/Public');
    if (!res.ok) throw new Error('unreachable');
    const info = await res.json();
    session.server = server;
    saveSession({ server });
    document.getElementById('login-server-label').textContent =
      (info.ServerName || 'JELLYFIN') + ' — ' + server.replace(/^https?:\/\//, '');
    showScreen('screen-login');
    document.getElementById('input-username').focus();
  } catch (err) {
    errorConnect.textContent = 'CANNOT REACH SERVER. Check the address (include http:// or https://) and that this device can see it on the network.';
  } finally {
    btn.disabled = false;
  }
});

/* =====================================================================
   SCREEN 2 — Login
   ===================================================================== */
const formLogin = document.getElementById('form-login');
const errorLogin = document.getElementById('error-login');

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorLogin.textContent = '';
  const btn = formLogin.querySelector('button[type=submit]');
  btn.disabled = true;
  const Username = document.getElementById('input-username').value.trim();
  const Pw = document.getElementById('input-password').value;
  try {
    const result = await jf('/Users/AuthenticateByName', {
      method: 'POST', auth: false, body: { Username, Pw },
    });
    session.token = result.AccessToken;
    session.userId = result.User.Id;
    session.username = result.User.Name;
    saveSession({ token: session.token, userId: session.userId, username: session.username });
    goLocateTitle();
  } catch (err) {
    errorLogin.textContent = 'LOGIN FAILED. Check your username and password.';
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-back-to-connect').addEventListener('click', () => {
  showScreen('screen-connect');
});

/* =====================================================================
   SCREEN 3 — Locating the title (no manual ID entry, ever)
   ===================================================================== */
const locatingLog = document.getElementById('locating-log');
const searchFallback = document.getElementById('search-fallback');
const searchResults = document.getElementById('search-results');

async function goLocateTitle() {
  showScreen('screen-locating');
  searchFallback.classList.add('hidden');
  await typeLines(locatingLog, [
    `WELCOME, ${session.username.toUpperCase()}.`,
    'SCANNING LIBRARY FOR "BANDERSNATCH"...',
  ], { speed: 10, pause: 120 });

  try {
    const results = await jf(
      `/Users/${session.userId}/Items?searchTerm=Bandersnatch&Recursive=true&IncludeItemTypes=Movie&Fields=Overview`
    );
    const items = results.Items || [];
    if (items.length === 1) {
      openTitle(items[0]);
    } else if (items.length > 1) {
      renderSearchResults(items);
    } else {
      locatingLog.textContent += '\nNOT FOUND. Search your library below.';
      searchFallback.classList.remove('hidden');
    }
  } catch {
    locatingLog.textContent += '\nSEARCH FAILED. Search your library below.';
    searchFallback.classList.remove('hidden');
  }
}

document.getElementById('btn-search').addEventListener('click', doManualSearch);
document.getElementById('input-search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doManualSearch();
});

async function doManualSearch() {
  const term = document.getElementById('input-search').value.trim();
  if (!term) return;
  try {
    const results = await jf(
      `/Users/${session.userId}/Items?searchTerm=${encodeURIComponent(term)}&Recursive=true&IncludeItemTypes=Movie,Series`
    );
    renderSearchResults(results.Items || []);
  } catch {
    searchResults.textContent = 'Search failed.';
  }
}

function renderSearchResults(items) {
  searchFallback.classList.remove('hidden');
  searchResults.innerHTML = '';
  items.slice(0, 8).forEach(item => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'search-result';
    row.innerHTML = `
      <img src="${imageUrl(item.Id)}" onerror="this.style.visibility='hidden'">
      <span>
        <div class="search-result-name">${item.Name}</div>
        <div class="search-result-year">${item.ProductionYear || ''}</div>
      </span>`;
    row.addEventListener('click', () => openTitle(item));
    searchResults.appendChild(row);
  });
}

/* =====================================================================
   SCREEN 4 — Title popup
   ===================================================================== */
let currentItem = null;

async function openTitle(item) {
  currentItem = item;
  document.getElementById('title-name').textContent = item.Name.toUpperCase();
  document.getElementById('title-poster').src = imageUrl(item.Id, 'Primary');
  const backdropEl = document.getElementById('title-backdrop');
  backdropEl.style.backgroundImage = item.BackdropImageTags && item.BackdropImageTags.length
    ? `url(${imageUrl(item.Id, 'Backdrop/0')})`
    : `url(${imageUrl(item.Id, 'Primary')})`;
  showScreen('screen-title');
}

document.getElementById('btn-play').addEventListener('click', () => startPlayback(currentItem));
document.getElementById('btn-logout').addEventListener('click', () => {
  clearSession();
  session = { deviceId: session.deviceId };
  saveSession({ deviceId: session.deviceId });
  location.reload();
});

/* =====================================================================
   SCREEN 5 — Player
   ===================================================================== */
const video = document.getElementById('video');
const chrome_ = document.getElementById('player-chrome');
const choiceOverlay = document.getElementById('choice-overlay');
const choiceTitle = document.getElementById('choice-title');
const choiceGrid = document.getElementById('choice-grid');
const choiceTimerFill = document.getElementById('choice-timer-fill');
const endingOverlay = document.getElementById('ending-overlay');
const cutFlash = document.getElementById('cut-flash');
let engine = null;
let playSessionId = null;
let progressTimer = null;

async function startPlayback(item) {
  showScreen('screen-player');
  document.getElementById('segment-readout').textContent = 'LOADING...';

  const playbackInfo = await jf(`/Items/${item.Id}/PlaybackInfo`, {
    method: 'POST',
    body: {
      UserId: session.userId,
      // Wide, permissive profile so an ordinary MKV rip (h264/hevc +
      // aac/ac3/dts, matroska container) qualifies for direct play —
      // a narrow profile here is the #1 cause of an unwanted
      // resolution-reducing transcode.
      DeviceProfile: {
        MaxStreamingBitrate: 800000000,
        DirectPlayProfiles: [
          {
            Container: 'mkv,matroska,webm,mp4,m4v,mov,avi,ts,mpegts',
            Type: 'Video',
            VideoCodec: 'h264,hevc,vp9,av1,vp8,mpeg4,mpeg2video',
            AudioCodec: 'aac,ac3,eac3,dts,truehd,flac,mp3,opus,vorbis,pcm_s16le,pcm_s24le',
          },
        ],
        TranscodingProfiles: [
          {
            Container: 'ts', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac',
            Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: '8',
          },
        ],
        SubtitleProfiles: [
          { Format: 'vtt', Method: 'External' },
          { Format: 'srt', Method: 'External' },
        ],
      },
    },
  });

  const source = playbackInfo.MediaSources[0];
  playSessionId = playbackInfo.PlaySessionId;
  const base = session.server.replace(/\/+$/, '');
  let src;
  if (source.SupportsDirectPlay) {
    src = `${base}/Videos/${item.Id}/stream?static=true&mediaSourceId=${encodeURIComponent(source.Id)}&api_key=${session.token}`;
  } else if (source.TranscodingUrl) {
    // Prefer the server's own computed URL — it already reflects our
    // DeviceProfile's bitrate/codec choices, rather than a guess.
    src = source.TranscodingUrl.startsWith('http') ? source.TranscodingUrl : base + source.TranscodingUrl;
    if (!src.includes('api_key=')) src += (src.includes('?') ? '&' : '?') + `api_key=${session.token}`;
  } else {
    src = `${base}/Videos/${item.Id}/master.m3u8?mediaSourceId=${encodeURIComponent(source.Id)}&api_key=${session.token}&VideoCodec=h264&AudioCodec=aac&MaxStreamingBitrate=120000000`;
  }
  window.__lastSource = source; // used by subtitle setup below

  await new Promise((resolve, reject) => {
    if (src.includes('.m3u8') && !video.canPlayType('application/vnd.apple.mpegurl') && window.Hls) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, resolve);
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) reject(data); });
    } else {
      video.src = src;
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', reject, { once: true });
    }
  });

  setupSubtitles(item.Id, source);
  reportPlaying(item.Id, source.Id);

  engine = new BandersnatchEngine(video, SegmentMap, STORY_DATA, {
    onSegmentChange: (id) => {
      document.getElementById('segment-readout').textContent = id;
    },
    onCut: () => {
      cutFlash.classList.remove('flash'); void cutFlash.offsetWidth; cutFlash.classList.add('flash');
    },
    onChoice: (title, options, msRemaining, select) => {
      choiceTitle.textContent = title;
      choiceGrid.innerHTML = '';
      options.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'choice-btn';
        b.textContent = opt.label;
        b.addEventListener('click', () => select(opt.index));
        choiceGrid.appendChild(b);
      });
      choiceTimerFill.style.transition = 'none';
      choiceTimerFill.style.transform = 'scaleX(1)';
      requestAnimationFrame(() => {
        choiceTimerFill.style.transition = `transform ${msRemaining}ms linear`;
        choiceTimerFill.style.transform = 'scaleX(0)';
      });
      choiceOverlay.classList.remove('hidden');
    },
    onChoiceClear: () => {
      choiceOverlay.classList.add('hidden');
      resetHideTimer();
    },
    onStoryEnd: () => {
      // The path has reached a narrative ending; the film usually
      // rolls on into a splitscreen / credits segment by itself.
    },
    onCredits: () => {
      showEnding('THE END', 'Roll credits, or jump back to the start.', { showContinue: true });
    },
    onFinished: () => {
      showEnding('BRANCH COMPLETE', 'This path has run its course.', { showContinue: false });
    },
  });
  engine.start();

  video.addEventListener('timeupdate', updateScrubber);
  initAutoHideChrome();
  initVolume();
}

function updateScrubber() {
  if (!video.duration || scrubbing) return;
  document.getElementById('progress-fill').style.width = (video.currentTime / video.duration * 100) + '%';
  document.getElementById('time-readout').textContent =
    fmtTime(video.currentTime) + ' / ' + fmtTime(video.duration);
}
function fmtTime(s) {
  s = Math.floor(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

document.getElementById('btn-playpause').addEventListener('click', () => {
  if (video.paused) video.play(); else video.pause();
});
document.getElementById('btn-exit').addEventListener('click', stopPlayback);

/* --- Fullscreen: the whole player screen, not just <video> --- */
const playerScreen = document.getElementById('screen-player');
const btnFullscreen = document.getElementById('btn-fullscreen');

function isFullscreen() {
  return document.fullscreenElement || document.webkitFullscreenElement;
}
function enterFullscreen() {
  if (playerScreen.requestFullscreen) playerScreen.requestFullscreen();
  else if (playerScreen.webkitRequestFullscreen) playerScreen.webkitRequestFullscreen();
  else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iOS Safari: video-only fallback
}
function exitFullscreen() {
  if (document.exitFullscreen) document.exitFullscreen();
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
}
function toggleFullscreen() {
  isFullscreen() ? exitFullscreen() : enterFullscreen();
}
btnFullscreen.addEventListener('click', toggleFullscreen);
video.addEventListener('dblclick', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  btnFullscreen.classList.toggle('is-fullscreen', !!isFullscreen());
});
document.addEventListener('webkitfullscreenchange', () => {
  btnFullscreen.classList.toggle('is-fullscreen', !!isFullscreen());
});

/* --- Auto-hide controls (shows on movement, hides after inactivity
   while playing — pauses stay visible, matching normal players) --- */
let hideTimer = null;
function showChromeNow() {
  chrome_.classList.add('show');
  playerScreen.classList.remove('cursor-hidden');
  resetHideTimer();
}
function resetHideTimer() {
  clearTimeout(hideTimer);
  if (video.paused || !choiceOverlay.classList.contains('hidden')) return; // stay visible
  hideTimer = setTimeout(() => {
    chrome_.classList.remove('show');
    playerScreen.classList.add('cursor-hidden');
  }, 2800);
}
function initAutoHideChrome() {
  playerScreen.addEventListener('mousemove', showChromeNow);
  playerScreen.addEventListener('touchstart', showChromeNow, { passive: true });
  video.addEventListener('play', resetHideTimer);
  video.addEventListener('pause', () => { chrome_.classList.add('show'); clearTimeout(hideTimer); });
  showChromeNow();
}

/* --- Keyboard shortcuts (space, arrows, mute, fullscreen) --- */
document.addEventListener('keydown', (e) => {
  if (!playerScreen.classList.contains('active')) return;
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return; // don't hijack typing

  switch (e.key) {
    case ' ':
    case 'k':
      e.preventDefault();
      video.paused ? video.play() : video.pause();
      showChromeNow();
      break;
    case 'ArrowLeft': {
      e.preventDefault();
      const targetMs = Math.max(0, video.currentTime * 1000 - 10000);
      engine ? engine.seekToTime(targetMs) : (video.currentTime -= 10);
      showChromeNow();
      break;
    }
    case 'ArrowRight': {
      e.preventDefault();
      const targetMs = Math.min((video.duration || Infinity) * 1000, video.currentTime * 1000 + 10000);
      engine ? engine.seekToTime(targetMs) : (video.currentTime += 10);
      showChromeNow();
      break;
    }
    case 'ArrowUp':
      e.preventDefault();
      setVolume(Math.min(1, video.volume + 0.1));
      showChromeNow();
      break;
    case 'ArrowDown':
      e.preventDefault();
      setVolume(Math.max(0, video.volume - 0.1));
      showChromeNow();
      break;
    case 'm':
    case 'M':
      toggleMute();
      showChromeNow();
      break;
    case 'f':
    case 'F':
      toggleFullscreen();
      break;
  }
});

/* --- Volume / mute --- */
const volumeSlider = document.getElementById('volume-slider');
const btnMute = document.getElementById('btn-mute');

function setVolume(v) {
  video.volume = v;
  video.muted = v === 0;
  volumeSlider.value = v;
  btnMute.textContent = v === 0 ? '\u{1F507}' : (v < 0.5 ? '\u{1F509}' : '\u{1F50A}');
  saveSession({ volume: v });
}
function toggleMute() {
  setVolume(video.muted || video.volume === 0 ? (session.volume || 1) : 0);
}
function initVolume() {
  const startVolume = session.volume != null ? session.volume : 1;
  setVolume(startVolume);
  volumeSlider.addEventListener('input', () => setVolume(parseFloat(volumeSlider.value)));
  btnMute.addEventListener('click', toggleMute);
}

/* --- Scrub bar: click/drag anywhere on the track to seek --- */
const progressTrack = document.querySelector('.progress-track');
const progressFill = document.getElementById('progress-fill');
let scrubbing = false;

function ratioFromEvent(e) {
  const rect = progressTrack.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  return Math.min(1, Math.max(0, x / rect.width));
}
function beginScrub(e) {
  if (!video.duration) return;
  scrubbing = true;
  chrome_.classList.add('show');
  moveScrub(e);
}
function moveScrub(e) {
  if (!scrubbing) return;
  const ratio = ratioFromEvent(e);
  progressFill.style.width = (ratio * 100) + '%';
  document.getElementById('time-readout').textContent =
    fmtTime(ratio * video.duration) + ' / ' + fmtTime(video.duration);
}
function endScrub(e) {
  if (!scrubbing) return;
  scrubbing = false;
  const ratio = ratioFromEvent(e);
  const targetMs = ratio * video.duration * 1000;
  if (engine) engine.seekToTime(targetMs); else video.currentTime = ratio * video.duration;
}
progressTrack.addEventListener('mousedown', beginScrub);
addEventListener('mousemove', moveScrub);
addEventListener('mouseup', endScrub);
progressTrack.addEventListener('touchstart', beginScrub, { passive: true });
addEventListener('touchmove', moveScrub, { passive: true });
addEventListener('touchend', endScrub);

/* --- Skip back/forward 10s --- */
document.getElementById('btn-skip-back').addEventListener('click', () => {
  const targetMs = Math.max(0, video.currentTime * 1000 - 10000);
  if (engine) engine.seekToTime(targetMs); else video.currentTime -= 10;
});
document.getElementById('btn-skip-fwd').addEventListener('click', () => {
  const targetMs = Math.min((video.duration || Infinity) * 1000, video.currentTime * 1000 + 10000);
  if (engine) engine.seekToTime(targetMs); else video.currentTime += 10;
});

/* --- Subtitles --- */
function setupSubtitles(itemId, source) {
  document.querySelectorAll('#video track').forEach(t => t.remove());
  const base = session.server.replace(/\/+$/, '');
  const subStreams = (source.MediaStreams || []).filter(s => s.Type === 'Subtitle');
  const select = document.getElementById('subtitle-select');
  select.innerHTML = '<option value="off">Subtitles: Off</option>';
  subStreams.forEach(s => {
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = s.DisplayTitle || s.Language || `Track ${s.Index}`;
    track.srclang = s.Language || 'und';
    track.src = `${base}/Videos/${itemId}/${source.Id}/Subtitles/${s.Index}/Stream.vtt?api_key=${session.token}`;
    track.dataset.index = s.Index;
    video.appendChild(track);

    const opt = document.createElement('option');
    opt.value = s.Index;
    opt.textContent = track.label;
    select.appendChild(opt);
  });
  select.classList.toggle('hidden', subStreams.length === 0);
  select.onchange = () => {
    Array.from(video.textTracks).forEach(tt => { tt.mode = 'hidden'; });
    if (select.value !== 'off') {
      const tt = Array.from(video.textTracks).find((_, i) => String(subStreams[i].Index) === select.value);
      if (tt) tt.mode = 'showing';
    }
  };
}

function showEnding(heading, sub, { showContinue }) {
  document.getElementById('ending-heading').textContent = heading;
  document.getElementById('ending-sub').textContent = sub;
  document.getElementById('btn-continue').classList.toggle('hidden', !showContinue);
  endingOverlay.classList.remove('hidden');
}
document.getElementById('btn-restart').addEventListener('click', () => {
  endingOverlay.classList.add('hidden');
  engine.destroy();
  video.currentTime = 0;
  engine = new BandersnatchEngine(video, SegmentMap, STORY_DATA, engine.cb);
  engine.start();
});
document.getElementById('btn-continue').addEventListener('click', () => {
  endingOverlay.classList.add('hidden');
});

function stopPlayback() {
  if (engine) engine.destroy();
  video.pause();
  reportStopped();
  showScreen('screen-title');
}

/* --- Best-effort Jellyfin "now playing" session reporting (non-blocking) --- */
function reportPlaying(itemId, mediaSourceId) {
  jf('/Sessions/Playing', { method: 'POST', body: {
    ItemId: itemId, MediaSourceId: mediaSourceId, PlaySessionId: playSessionId, CanSeek: true,
  }}).catch(() => {});
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    jf('/Sessions/Playing/Progress', { method: 'POST', body: {
      ItemId: itemId, MediaSourceId: mediaSourceId, PlaySessionId: playSessionId,
      PositionTicks: Math.floor(video.currentTime * 10000000), IsPaused: video.paused,
    }}).catch(() => {});
  }, 5000);
}
function reportStopped() {
  if (progressTimer) clearInterval(progressTimer);
  jf('/Sessions/Playing/Stopped', { method: 'POST', body: {
    PlaySessionId: playSessionId, PositionTicks: Math.floor(video.currentTime * 10000000),
  }}).catch(() => {});
}

/* =====================================================================
   Boot
   ===================================================================== */
(function boot() {
  // Scanline canvas
  const c = document.getElementById('scanlines');
  const ctx = c.getContext('2d');
  function drawScanlines() {
    c.width = innerWidth; c.height = innerHeight;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#000';
    for (let y = 0; y < c.height; y += 2) ctx.fillRect(0, y, c.width, 1);
  }
  drawScanlines();
  addEventListener('resize', drawScanlines);

  if (session.server && session.token && session.userId) {
    goLocateTitle();
  } else if (session.server) {
    fetch(session.server + '/System/Info/Public').then(r => r.json()).then(info => {
      document.getElementById('login-server-label').textContent =
        (info.ServerName || 'JELLYFIN') + ' — ' + session.server.replace(/^https?:\/\//, '');
      showScreen('screen-login');
    }).catch(initConnectScreen);
  } else {
    initConnectScreen();
  }
})();

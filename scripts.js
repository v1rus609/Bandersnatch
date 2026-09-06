/* Data initialization */
var segmentMap = SegmentMap;
var bv = bandersnatch.videos['80988062'].interactiveVideoMoments.value;
var choicePoints = bv.choicePointNavigatorMetadata.choicePointsMetadata.choicePoints;
var momentsBySegment = bv.momentsBySegment;
var segmentGroups = bv.segmentGroups;

var moments = JSON.parse(JSON.stringify(momentsBySegment));
var translated_choices = en;

function switch_choices() {
	for (var key in translated_choices) {
		for (var i = 0; i < Object.keys(moments[key]).length; i++) {
			if ("choices" in moments[key][i]) {
				for (var k = 0; k < Object.keys(moments[key][i]["choices"]).length; k++) {
					if ("id" in moments[key][i]["choices"][k]) {
						if (moments[key][i]["choices"][k]['id'] in translated_choices[key]) {
							moments[key][i]["choices"][k]['text'] = translated_choices[key][moments[key][i]["choices"][k]["id"]];
						}
					}
				}
			}
		}
	}
	return moments;
}

var ls = window.localStorage || {};
if (!('initialized' in ls)) {
	for (let k in bv.stateHistory)
		ls["persistentState_" + k] = JSON.stringify(bv.stateHistory[k]);
	ls['initialized'] = 't';
}

function msToString(ms) {
	return new Date(ms).toUTCString().split(' ')[4];
}

function getCurrentMs() {
	return Math.round(document.getElementById("video").currentTime * 1000.0);
}

function preconditionToJS(cond) {
	if (cond[0] == 'persistentState') {
		return 'JSON.parse(ls["persistentState_' + cond[1] + '"])';
	} else if (cond[0] == 'not') {
		return '!(' + preconditionToJS(cond[1]) + ')';
	} else if (cond[0] == 'and') {
		return '(' + cond.slice(1).map(preconditionToJS).join(' && ') + ')';
	} else if (cond[0] == 'or') {
		return '(' + cond.slice(1).map(preconditionToJS).join(' || ') + ')';
	} else if (cond[0] == 'eql' && cond.length == 3) {
		return '(' + cond.slice(1).map(preconditionToJS).join(' == ') + ')';
	} else if (cond === false) {
		return 'false';
	} else if (cond === true) {
		return 'true';
	} else if (typeof cond === 'string') {
		return JSON.stringify(cond);
	} else {
		return 'true';
	}
}

function evalPrecondition(precondition, text) {
	if (precondition) {
		let cond = preconditionToJS(precondition);
		let match = eval(cond);
		return match;
	}
	return true;
}

function checkPrecondition(preconditionId) {
	return evalPrecondition(bv.preconditions[preconditionId], preconditionId);
}

function resolveSegmentGroup(sg) {
	let results = [];
	for (let v of segmentGroups[sg]) {
		if (v.precondition) {
			if (!checkPrecondition(v.precondition))
				continue;
		}
		if (v.segmentGroup) {
			results.push(resolveSegmentGroup(v.segmentGroup));
		} else if (v.segment) {
			results.push(v.segment);
		} else {
			if (!checkPrecondition(v))
				continue;
			results.push(v);
		}
	}
	return results[0];
}

function getSegmentId(ms) {
	for (const [k, v] of Object.entries(segmentMap.segments)) {
		if (ms >= v.startTimeMs && (!v.endTimeMs || ms < v.endTimeMs)) {
			return k;
		}
	}
	return null;
}

function getSegmentMs(segmentId) {
	return segmentMap.segments[segmentId].startTimeMs;
}

function getMoments(segmentId, ms) {
	let result = {};
	let moments = momentsBySegment[segmentId] || [];
	for (let i = 0; i < moments.length; i++) {
		let m = moments[i];
		let momentId = segmentId + '/' + i;
		if (ms >= m.startMs && ms < m.endMs && evalPrecondition(m.precondition, 'moment ' + momentId)) {
			result[momentId] = m;
		}
	}
	return result;
}

function newList(id) {
	var ul = document.getElementById(id);
	while (ul.firstChild) {
		ul.removeChild(ul.firstChild);
	}
	return ul;
}

let selectedDigits = [];
function addItem(ul, text, url, TheChoice, isDefault) {
	if (TheChoice.type !== "scene:cs_bs_phone"){
		var li = document.createElement("li");
		var a = document.createElement("a");
		if (isDefault) li.classList.add('is-default-choice');
		if (TheChoice && TheChoice.image){
			a.style.backgroundImage = TheChoice.image.styles.backgroundImage;
			a.style.backgroundPosition = "center center";
			a.style.backgroundSize = "10rem";
			a.style.backgroundRepeat = TheChoice.image.styles.backgroundRepeat;
		} else {
			a.textContent = text;
		}
		a.setAttribute('href', url);
		li.appendChild(a);
		ul.appendChild(li);
	} else {
		selectedDigits = [];
		var inputContainer = document.createElement('div');
		inputContainer.className = 'input-container';

		for (var i = 0; i < 5; i++) {
			var inputField = document.createElement('span');
			inputField.type = 'text';
			inputField.className = 'inputField';
			inputContainer.appendChild(inputField);
		}
		
		var lineBreak = document.createElement('br');
		inputContainer.appendChild(lineBreak.cloneNode());
		inputContainer.appendChild(lineBreak.cloneNode());

		var buttonContainer = document.createElement('div');
		buttonContainer.className = 'buttonsCode';

		for (var i = 0; i < 10; i++) {
			var listItem = document.createElement('span');
			listItem.className = "buttonCodeNumber";
			listItem.textContent = i;
			listItem.setAttribute('onclick', 'selectDigit(' + i + ')');
			buttonContainer.appendChild(listItem);
		}

		var containerCode = document.createElement('div');
		containerCode.className = 'containerCode';
		containerCode.appendChild(inputContainer);
		containerCode.appendChild(buttonContainer);
		
		ul.appendChild(containerCode);
		updateInputPlaceholders();
	}
}

var nextChoice = -1;
var nextSegment = null;

function addZones(segmentId) {
	var ul = newList("interactionZones");
	let caption = 'currentSegment(' + segmentId + ')';
	addItem(ul, caption, 'javascript:playSegment("' + segmentId + '")', false);

	var segment = segmentMap.segments[segmentId];
	if (segment && segment.ui && segment.ui.interactionZones) {
		var index = 0;
		for (var z of segment.ui.interactionZones) {
			var startMs = z[0];
			let caption = segmentId + ' interactionZone ' + index;
			addItem(ul, caption, 'javascript:seek(' + startMs + ')', false);
			index++;
		}
	}

	ul = newList("nextSegments");
	if (segment) {
		for (const [k, v] of Object.entries(segment.next)) {
			let caption = k;
			if (segment.defaultNext == k)
				caption = '[' + caption + ']';
			addItem(ul, caption, 'javascript:playSegment("' + k + '")', false);
		}
	}
}

function selectDigit(digit) {
	if (selectedDigits.length <= 5) {
		const emptyInputField = getEmptyInputField();
		if (emptyInputField) {
			emptyInputField.innerText  = digit;
			selectedDigits.push(digit);
		}

		if (selectedDigits.length >= 5) {
			var code = selectedDigits.join('');
			if (code == "20541"){
				choice(0);
			} else {
				choice(1);
			}
		}
	}	
	updateInputPlaceholders();
}

function updateInputPlaceholders() {
	const inputFields = document.querySelectorAll('.inputField');
	for (let i = 0; i < inputFields.length; i++) {
		if (inputFields[i].textContent === '') {
			inputFields[i].textContent = "-";
		}
	}
}

function getEmptyInputField() {
	const inputFields = document.querySelectorAll('.inputField');
	for (let i = 0; i < inputFields.length; i++) {
		if (inputFields[i].textContent === '-') {
			return inputFields[i];
		}
	}
	return null;
}

function addChoices(r) {
	currentChoiceMoment = r;
	nextChoice = -1;
	var ul = newList("choices");
	document.getElementById("choiceCaption").innerHTML = '';

	var stage = document.getElementById('choiceStage');
	if (stage) stage.classList.toggle('is-active', !!r);

	if (!r) return;

	nextChoice = r.defaultChoiceIndex;
	if (r.type == "scene:cs_bs_phone"){
		addItem(ul, "", "", r);
	} else {
		let index = 0;
		for (let x of r.choices) {
			var isDefault = r.defaultChoiceIndex == index;
			var caption = x.text;
			addItem(ul, caption, 'javascript:choice(' + index + ')', x, isDefault);
			index++;
		}
	}

	if (r.id in choicePoints)
		document.getElementById("choiceCaption").innerHTML = choicePoints[r.id].description;
}

function momentStart(m, seeked) {
	if (m.choices) {
		addChoices(m);
	}
	if (!seeked)
		applyImpression(m.impressionData);
}

function momentUpdate(m, ms) {
	if (m.choices) {
		var p = 100 - ((ms - m.startMs) * 100.0 / (m.endMs - m.startMs));
		document.getElementById("progress").style.width = p + '%';
	}
}

function momentEnd(m, seeked) {
	if (m.choices) {
		addChoices(null);
		document.getElementById("progress").style.width = 0;
	}
}

var timerId = 0;
var lastMs = 0;
var currentSegment;
var lastSegment = null;
var prevSegment = null;
var segmentTransition = false;
var lastMoments = [];

function ontimeupdate(evt) {
	var ms = getCurrentMs();
	currentSegment = getSegmentId(ms);
	let segment = segmentMap.segments[currentSegment];

	if (timerId) {
		clearTimeout(timerId);
		timerId = 0;
	}

	let timeElapsed = ms - lastMs;
	let seeked = timeElapsed < 0 || timeElapsed >= 2000;
	lastMs = ms;

	let placeChanged = false;

	if (lastSegment != currentSegment) {
		prevSegment = lastSegment;
		lastSegment = currentSegment;
		if (!seeked && prevSegment) {
			if (playNextSegment(prevSegment)) {
				return;
			}
		}
		addZones(currentSegment);
		placeChanged = true;
	}

	var naturalTransition = !seeked || segmentTransition;
	segmentTransition = false;

	var currentMoments = getMoments(currentSegment, ms);
	for (let k in lastMoments)
		if (!(k in currentMoments)) {
			momentEnd(lastMoments[k], !naturalTransition);
			placeChanged = true;
		}
	for (let k in lastMoments)
		if (k in currentMoments)
			momentUpdate(lastMoments[k], ms);
	for (let k in currentMoments)
		if (!(k in lastMoments)) {
			momentStart(currentMoments[k], !naturalTransition);
			placeChanged = true;
		}
	lastMoments = currentMoments;

	if (placeChanged) {
		let title = 'Bandersnatch - Chapter ' + currentSegment;
		document.title = title;

		let hash = currentSegment;
		let bestMomentStart = segment ? segment.startTimeMs : 0;
		for (let k in currentMoments) {
			let m = currentMoments[k];
			if (m.startMs > bestMomentStart) {
				hash = k;
				bestMomentStart = m.startMs;
			}
		}
		hash = '#' + hash;
		lastHash = hash;
		location.hash = hash;
		ls.place = hash;
	}

	let nextEvent = segment ? segment.endTimeMs : 0;
	for (let k in currentMoments) {
		let m = currentMoments[k];
		if (m.endMs < nextEvent)
			nextEvent = m.endMs;
	}
	for (let m of momentsBySegment[currentSegment] || [])
		if (ms < m.startMs && m.startMs < nextEvent)
			nextEvent = m.startMs;
	var timeLeft = nextEvent - ms;
	if (timeLeft > 0)
		timerId = setTimeout(ontimeupdate, timeLeft);
}

function playNextSegment(prevSegment) {
	let nextSegment = null;
	if (nextChoice >= 0) {
		let x = currentChoiceMoment.choices[nextChoice];
		if (x.segmentId)
			nextSegment = x.segmentId;
		else if (x.sg)
			nextSegment = resolveSegmentGroup(x.sg);
		else
			nextSegment = null;
		nextChoice = -1;
		applyImpression(x.impressionData);
	}

	if (!nextSegment && prevSegment && prevSegment in segmentGroups)
		nextSegment = resolveSegmentGroup(prevSegment);

	if (!nextSegment && prevSegment && segmentMap.segments[prevSegment].defaultNext)
		nextSegment = segmentMap.segments[prevSegment].defaultNext;

	if (!nextSegment)
		return false;

	let breadcrumb = 'breadcrumb_' + nextSegment;
	if (!(breadcrumb in ls))
		ls[breadcrumb] = prevSegment;

	segmentTransition = true;
	return playSegment(nextSegment, true);
}

function jumpForward() {
	var ms = getCurrentMs();
	var segmentId = getSegmentId(ms);

	var interactionMs = 0;
	let moments = momentsBySegment[segmentId] || [];
	for (let m of moments)
		if (m.startMs > ms && (interactionMs == 0 || m.startMs < interactionMs))
			interactionMs = m.startMs;

	segmentTransition = true;
	if (interactionMs) {
		seek(interactionMs);
	} else {
		playNextSegment(segmentId);
	}
}

function jumpBack() {
	var ms = getCurrentMs();
	var segmentId = getSegmentId(ms);
	let segment = segmentMap.segments[segmentId];

	var interactionMs = 0;
	let moments = momentsBySegment[segmentId] || [];
	let inMoment = false;
	for (let m of moments) {
		if (m.endMs < ms && m.startMs > interactionMs)
			interactionMs = m.startMs;
		if (m.startMs != segment.startTimeMs && m.startMs <= ms && ms < m.endMs)
			inMoment = true;
	}

	segmentTransition = true;
	if (interactionMs) {
		seek(interactionMs);
	} else if (inMoment) {
		seek(segment.startTimeMs);
	} else {
		let breadcrumb = 'breadcrumb_' + segmentId;
		if (breadcrumb in ls) {
			segmentId = ls[breadcrumb];
			segment = segmentMap.segments[segmentId];

			interactionMs = segment.startTimeMs;
			let moments = momentsBySegment[segmentId] || [];
			for (let m of moments)
				if (m.startMs > interactionMs)
					interactionMs = m.startMs;
			seek(interactionMs);
		} else {
			seek(0);
		}
	}
}

function toggleFullScreen() {
	var c = document.getElementById("c");
	if (!document.fullscreenElement && !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
		if (c.requestFullscreen) {
			c.requestFullscreen();
		} else if (c.msRequestFullscreen) {
			c.msRequestFullscreen();
		} else if (c.mozRequestFullScreen) {
			c.mozRequestFullScreen();
		} else if (c.webkitRequestFullscreen) {
			c.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
		}
	} else {
		if (document.exitFullscreen) {
			document.exitFullscreen();
		} else if (document.msExitFullscreen) {
			document.msExitFullscreen();
		} else if (document.mozCancelFullScreen) {
			document.mozCancelFullScreen();
		} else if (document.webkitExitFullscreen) {
			document.webkitExitFullscreen();
		}
	}
}

function togglePlayPause() {
	var v = document.getElementById("video");
	if (v.paused) v.play();
	else v.pause();
}

/* =====================================================================
   Jellyfin session + auth (ported from app.js)
   ===================================================================== */
var JF_LS_KEY = 'bsp.session';

function jfLoadSession() {
	try { return JSON.parse(localStorage.getItem(JF_LS_KEY)) || {}; }
	catch (e) { return {}; }
}
function jfSaveSession(patch) {
	var cur = jfLoadSession();
	for (var k in patch) cur[k] = patch[k];
	localStorage.setItem(JF_LS_KEY, JSON.stringify(cur));
}
function jfClearSession() { localStorage.removeItem(JF_LS_KEY); }

var jellyfinSession = jfLoadSession();
if (!jellyfinSession.deviceId) {
	jellyfinSession.deviceId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random());
	jfSaveSession({ deviceId: jellyfinSession.deviceId });
}

var JF_APP_NAME = 'BandersnatchPlayer';
var JF_APP_VERSION = '1.0.0';
var JF_DEFAULT_ITEM_ID = '4ed68723f27b3717298751e5ed578a43';

function jfAuthHeader() {
	return 'MediaBrowser Client="' + JF_APP_NAME + '", Device="Web", DeviceId="' +
		jellyfinSession.deviceId + '", Version="' + JF_APP_VERSION + '"';
}

// Generic authenticated Jellyfin request helper, matching app.js's jf().
function jf(path, opts) {
	opts = opts || {};
	var method = opts.method || 'GET';
	var auth = opts.auth !== false;
	var headers = { 'Content-Type': 'application/json' };
	headers['X-Emby-Authorization'] = jfAuthHeader();
	if (auth && jellyfinSession.token) headers['X-Emby-Token'] = jellyfinSession.token;
	return fetch(jellyfinSession.server.replace(/\/+$/, '') + path, {
		method: method,
		headers: headers,
		body: opts.body ? JSON.stringify(opts.body) : undefined
	}).then(function (res) {
		if (!res.ok) throw new Error(method + ' ' + path + ' -> ' + res.status);
		return res.text().then(function (text) { return text ? JSON.parse(text) : null; });
	});
}

// Same DeviceProfile / stream-resolution logic as app.js's startPlayback,
// split into reusable pieces since this player takes an itemId directly
// rather than an item object from a search result.
function jfNegotiatePlayback(itemId) {
	return jf('/Items/' + encodeURIComponent(itemId) + '/PlaybackInfo', {
		method: 'POST',
		body: {
			UserId: jellyfinSession.userId,
			DeviceProfile: {
				MaxStreamingBitrate: 800000000,
				DirectPlayProfiles: [
					{
						Container: 'mkv,matroska,webm,mp4,m4v,mov,avi,ts,mpegts',
						Type: 'Video',
						VideoCodec: 'h264,hevc,vp9,av1,vp8,mpeg4,mpeg2video',
						AudioCodec: 'aac,ac3,eac3,dts,truehd,flac,mp3,opus,vorbis,pcm_s16le,pcm_s24le'
					}
				],
				TranscodingProfiles: [
					{
						Container: 'ts', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac',
						Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: '8'
					}
				],
				SubtitleProfiles: [
					{ Format: 'vtt', Method: 'External' },
					{ Format: 'srt', Method: 'External' }
				]
			}
		}
	});
}

function jfResolveStreamUrl(itemId, source) {
	var base = jellyfinSession.server.replace(/\/+$/, '');
	if (source.SupportsDirectPlay) {
		return base + '/Videos/' + encodeURIComponent(itemId) + '/stream?static=true' +
			'&mediaSourceId=' + encodeURIComponent(source.Id) + '&api_key=' + jellyfinSession.token;
	}
	if (source.TranscodingUrl) {
		var url = source.TranscodingUrl.indexOf('http') === 0 ? source.TranscodingUrl : base + source.TranscodingUrl;
		if (url.indexOf('api_key=') === -1)
			url += (url.indexOf('?') === -1 ? '?' : '&') + 'api_key=' + jellyfinSession.token;
		return url;
	}
	return base + '/Videos/' + encodeURIComponent(itemId) + '/master.m3u8' +
		'?mediaSourceId=' + encodeURIComponent(source.Id) + '&api_key=' + jellyfinSession.token +
		'&VideoCodec=h264&AudioCodec=aac&MaxStreamingBitrate=120000000';
}

// Attaches a resolved stream URL to the <video>, using hls.js for an HLS
// transcode when the browser can't play HLS natively, exactly as app.js does.
function jfAttachStream(video, streamUrl) {
	if (video._hls) {
		video._hls.destroy();
		video._hls = null;
	}
	return new Promise(function (resolve, reject) {
		if (streamUrl.indexOf('.m3u8') !== -1 && !video.canPlayType('application/vnd.apple.mpegurl') && window.Hls) {
			var hls = new Hls();
			video._hls = hls;
			hls.loadSource(streamUrl);
			hls.attachMedia(video);
			hls.on(Hls.Events.MANIFEST_PARSED, function () { resolve(); });
			hls.on(Hls.Events.ERROR, function (_, data) { if (data.fatal) reject(data); });
		} else {
			video.src = streamUrl;
			video.addEventListener('loadedmetadata', function onLoaded() {
				video.removeEventListener('loadedmetadata', onLoaded);
				resolve();
			});
			video.addEventListener('error', function onErr(e) {
				video.removeEventListener('error', onErr);
				reject(e);
			}, { once: true });
		}
	});
}

function jfSubtitleTracks(itemId, source) {
	var base = jellyfinSession.server.replace(/\/+$/, '');
	var streams = (source.MediaStreams || []).filter(function (s) { return s.Type === 'Subtitle'; });
	return streams.map(function (s) {
		return {
			src: base + '/Videos/' + encodeURIComponent(itemId) + '/' + encodeURIComponent(source.Id) +
				'/Subtitles/' + s.Index + '/Stream.vtt?api_key=' + jellyfinSession.token,
			label: s.DisplayTitle || s.Language || ('Track ' + s.Index),
			srclang: s.Language || 'und',
			isDefault: !!s.IsDefault
		};
	});
}

function attachSubtitleTracks(video, tracks) {
	video.querySelectorAll('track[data-dynamic]').forEach(function (t) { t.remove(); });
	tracks.forEach(function (t) {
		var trackEl = document.createElement('track');
		trackEl.kind = 'subtitles';
		trackEl.src = t.src;
		trackEl.srclang = t.srclang || 'en';
		trackEl.label = t.label || t.srclang || 'Subtitles';
		trackEl.setAttribute('data-dynamic', '1');
		if (t.isDefault)
			trackEl.default = true;
		video.appendChild(trackEl);

		var tt = trackEl.track;
		if (tt) tt.mode = t.isDefault ? 'showing' : 'hidden';
	});
}

function srtToVtt(srtText) {
	var body = srtText.replace(/\r/g, '')
		.replace(/^\uFEFF/, '')
		.replace(/^\d+\s*\n(?=\d{2}:\d{2}:\d{2}[,.]\d{3})/gm, '')
		.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
	return 'WEBVTT\n\n' + body.trim() + '\n';
}

function formatTime(seconds) {
	if (!isFinite(seconds) || seconds < 0) seconds = 0;
	seconds = Math.floor(seconds);
	var h = Math.floor(seconds / 3600);
	var m = Math.floor((seconds % 3600) / 60);
	var s = seconds % 60;
	var mStr = (h && m < 10) ? '0' + m : String(m);
	var sStr = s < 10 ? '0' + s : String(s);
	return h ? (h + ':' + mStr + ':' + sStr) : (mStr + ':' + sStr);
}

function setupPlayerBar(video) {
	var bar = document.getElementById('playerBar');
	if (!bar) return;

	var btnPlayPause = document.getElementById('btn-playpause');
	var iconPlay = btnPlayPause.querySelector('.icon-play');
	var iconPause = btnPlayPause.querySelector('.icon-pause');
	var btnBack10 = document.getElementById('btn-back10');
	var btnFwd10 = document.getElementById('btn-fwd10');
	var timeEl = document.getElementById('pbarTime');
	var seekEl = document.getElementById('pbarSeek');
	var seekFill = document.getElementById('pbarSeekFill');
	var btnMute = document.getElementById('btn-mute');
	var iconVolHigh = btnMute.querySelector('.icon-vol-high');
	var iconVolMuted = btnMute.querySelector('.icon-vol-muted');
	var volumeSlider = document.getElementById('volumeSlider');
	var btnSubs = document.getElementById('btn-subs');
	var subsMenu = document.getElementById('subsMenu');
	var btnFullscreen = document.getElementById('btn-fullscreen');
	var wrapper = document.getElementById('wrapper-video');

	function updatePlayPauseIcon() {
		iconPlay.classList.toggle('is-hidden', !video.paused);
		iconPause.classList.toggle('is-hidden', video.paused);
		btnPlayPause.classList.toggle('is-paused', video.paused);
	}

	btnPlayPause.addEventListener('click', togglePlayPause);
	video.addEventListener('play', updatePlayPauseIcon);
	video.addEventListener('pause', updatePlayPauseIcon);

	btnBack10.addEventListener('click', function () {
		seek(Math.max(0, getCurrentMs() - 10000));
	});
	btnFwd10.addEventListener('click', function () {
		var maxMs = (video.duration || 0) * 1000;
		seek(Math.min(maxMs, getCurrentMs() + 10000));
	});

	var scrubbing = false;
	function updateSeekUI() {
		if (scrubbing) return;
		var dur = video.duration || 0;
		var pct = dur ? (video.currentTime / dur) * 100 : 0;
		seekFill.style.width = pct + '%';
		timeEl.textContent = formatTime(video.currentTime) + ' / ' + formatTime(dur);
	}
	video.addEventListener('timeupdate', updateSeekUI);
	video.addEventListener('loadedmetadata', updateSeekUI);

	function pctFromEvent(e) {
		var rect = seekEl.getBoundingClientRect();
		var clientX = e.touches ? e.touches[0].clientX : e.clientX;
		var pct = (clientX - rect.left) / rect.width;
		return Math.min(1, Math.max(0, pct));
	}

	function scrubTo(e) {
		var pct = pctFromEvent(e);
		seekFill.style.width = (pct * 100) + '%';
		var dur = video.duration || 0;
		timeEl.textContent = formatTime(pct * dur) + ' / ' + formatTime(dur);
		return pct;
	}

	seekEl.addEventListener('mousedown', function (e) {
		scrubbing = true;
		scrubTo(e);
		function onMove(e) { scrubTo(e); }
		function onUp(e) {
			var pct = scrubTo(e);
			var dur = video.duration || 0;
			seek(pct * dur * 1000);
			scrubbing = false;
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		}
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	});

	function updateMuteIcon() {
		var muted = video.muted || video.volume === 0;
		iconVolHigh.classList.toggle('is-hidden', muted);
		iconVolMuted.classList.toggle('is-hidden', !muted);
		btnMute.classList.toggle('is-muted', muted);
	}
	btnMute.addEventListener('click', function () {
		video.muted = !video.muted;
		updateMuteIcon();
	});
	volumeSlider.addEventListener('input', function () {
		video.volume = parseFloat(volumeSlider.value);
		video.muted = video.volume === 0;
		updateMuteIcon();
	});

	function rebuildSubsMenu() {
		subsMenu.innerHTML = '';
		var tracks = video.textTracks || [];

		var offBtn = document.createElement('button');
		offBtn.type = 'button';
		offBtn.textContent = 'Off';
		offBtn.className = 'pbar-menu-item';
		offBtn.addEventListener('click', function () {
			for (var i = 0; i < tracks.length; i++) tracks[i].mode = 'hidden';
			subsMenu.hidden = true;
			highlightActiveTrack();
		});
		subsMenu.appendChild(offBtn);

		for (var i = 0; i < tracks.length; i++) {
			(function (track, idx) {
				var item = document.createElement('button');
				item.type = 'button';
				item.className = 'pbar-menu-item';
				item.textContent = track.label || track.language || ('Track ' + (idx + 1));
				item.addEventListener('click', function () {
					for (var j = 0; j < tracks.length; j++) tracks[j].mode = 'hidden';
					track.mode = 'showing';
					subsMenu.hidden = true;
					highlightActiveTrack();
				});
				subsMenu.appendChild(item);
			})(tracks[i], i);
		}

		if (tracks.length === 0) {
			var none = document.createElement('div');
			none.className = 'pbar-menu-empty';
			none.textContent = 'No subtitles found';
			subsMenu.appendChild(none);
		}
		highlightActiveTrack();
	}

	function highlightActiveTrack() {
		var tracks = video.textTracks || [];
		var items = subsMenu.querySelectorAll('.pbar-menu-item');
		var anyShowing = false;
		for (var i = 0; i < tracks.length; i++) if (tracks[i].mode === 'showing') anyShowing = true;
		items.forEach(function (item, idx) {
			var isOff = idx === 0;
			item.classList.toggle('is-active', isOff ? !anyShowing : (tracks[idx - 1] && tracks[idx - 1].mode === 'showing'));
		});
		btnSubs.classList.toggle('is-active', anyShowing);
	}

	btnSubs.addEventListener('click', function (e) {
		e.stopPropagation();
		rebuildSubsMenu();
		subsMenu.hidden = !subsMenu.hidden;
	});
	document.addEventListener('click', function () {
		subsMenu.hidden = true;
	});
	if (video.textTracks) {
		video.textTracks.addEventListener('addtrack', rebuildSubsMenu);
	}

	btnFullscreen.addEventListener('click', toggleFullScreen);

	var hideTimer = null;
	function showBar() {
		bar.classList.add('is-visible');
		if (hideTimer) clearTimeout(hideTimer);
		if (!video.paused) {
			hideTimer = setTimeout(function () {
				bar.classList.remove('is-visible');
			}, 3000);
		}
	}
	wrapper.addEventListener('mousemove', showBar);
	wrapper.addEventListener('mouseenter', showBar);
	bar.addEventListener('mouseenter', function () {
		if (hideTimer) clearTimeout(hideTimer);
	});
	bar.addEventListener('mouseleave', showBar);
	video.addEventListener('pause', showBar);
	video.addEventListener('play', showBar);

	updatePlayPauseIcon();
	updateMuteIcon();
	showBar();
}

window.onload = function() {
	var video_selector = document.getElementById("video");
	var video_source_selector = document.getElementById("video-source");
	var file_selector = document.getElementById("file-selector");

	function startPlayback() {
		file_selector.style.display = 'none';
		if (window.location.hash)
			playHash(window.location.hash);
		else if (ls.place)
			playHash(ls.place);
		else
			playSegment(null);
		video_selector.play();
	}

	if (video_source_selector.getAttribute("src") == '') {
		file_selector.style.display = 'flex';
		document.getElementById("wrapper-video").style.display = 'none';
	} else {
		startPlayback();
	}

	document.getElementById('fileinput').addEventListener('change', function () {
		var file = this.files[0];
		var fileUrl = URL.createObjectURL(file);
		video_selector.src = fileUrl;
		document.getElementById("wrapper-video").style.display = 'block';
		startPlayback();
	}, false);

	(function () {
		var subInput = document.getElementById('subtitleinput');
		if (!subInput) return;
		var defaultLabel = document.getElementById('sub-label-default');
		var successLabel = document.getElementById('sub-label-success');
		subInput.addEventListener('change', function () {
			var file = this.files && this.files[0];
			if (!file) return;
			var reader = new FileReader();
			reader.onload = function () {
				var text = String(reader.result);
				var looksLikeSrt = /\.srt$/i.test(file.name) || !/^\uFEFF?WEBVTT/.test(text);
				var vttText = looksLikeSrt ? srtToVtt(text) : text;
				var blobUrl = URL.createObjectURL(new Blob([vttText], { type: 'text/vtt' }));
				attachSubtitleTracks(video_selector, [{
					src: blobUrl,
					label: file.name.replace(/\.(srt|vtt)$/i, ''),
					srclang: 'en',
					isDefault: true
				}]);
				if (defaultLabel) defaultLabel.style.display = 'none';
				if (successLabel) successLabel.style.display = 'inline';
			};
			reader.readAsText(file);
		}, false);
	})();

	(function () {
		var connectForm = document.getElementById('jellyfin-connect-form');
		var loginForm = document.getElementById('jellyfin-login-form');
		if (!connectForm || !loginForm) return;

		var serverInput = document.getElementById('jf-server');
		var itemIdInput = document.getElementById('jf-itemid');
		var connectErrorEl = document.getElementById('jf-connect-error');
		var serverLabel = document.getElementById('jf-server-label');
		var usernameInput = document.getElementById('jf-username');
		var passwordInput = document.getElementById('jf-password');
		var errorEl = document.getElementById('jf-error');
		var backBtn = document.getElementById('jf-back');
		var jfLog = document.getElementById('jf-boot-log');
		var currentItemId = JF_DEFAULT_ITEM_ID;

		function jfLine(text) {
			if (!jfLog) return;
			jfLog.textContent += (jfLog.textContent ? '\n' : '') + text;
		}
		function jfLogReset() {
			if (jfLog) jfLog.textContent = '';
		}

		function showLoginStep(itemId) {
			currentItemId = itemId || JF_DEFAULT_ITEM_ID;
			connectForm.classList.add('hidden');
			loginForm.classList.remove('hidden');
			usernameInput.focus();
		}
		function showConnectStep() {
			loginForm.classList.add('hidden');
			connectForm.classList.remove('hidden');
			serverInput.focus();
		}
		backBtn.addEventListener('click', showConnectStep);

		// SCREEN 1 -> SCREEN 2, ported from app.js's formConnect submit handler:
		// ping /System/Info/Public to validate the address before asking for
		// credentials.
		connectForm.addEventListener('submit', function (e) {
			e.preventDefault();
			connectErrorEl.textContent = '';
			var btn = connectForm.querySelector('button');
			btn.disabled = true;
			var server = serverInput.value.trim().replace(/\/+$/, '');
			if (!/^https?:\/\//i.test(server)) server = 'http://' + server;
			var itemId = itemIdInput ? itemIdInput.value.trim() : '';
			fetch(server + '/System/Info/Public').then(function (res) {
				if (!res.ok) throw new Error('unreachable');
				return res.json();
			}).then(function (info) {
				jellyfinSession.server = server;
				jfSaveSession({ server: server });
				jfLogReset();
				serverLabel.textContent = (info.ServerName || 'JELLYFIN') + ' \u2014 ' + server.replace(/^https?:\/\//, '');
				showLoginStep(itemId);
			}).catch(function () {
				connectErrorEl.textContent = 'CANNOT REACH SERVER. Check the address (include http:// or https://) and that this device can see it on the network.';
			}).then(function () {
				btn.disabled = false;
			});
		});

		// SCREEN 2 -> playback, ported from app.js's formLogin submit handler:
		// AuthenticateByName, persist the session, then locate and play.
		loginForm.addEventListener('submit', function (e) {
			e.preventDefault();
			errorEl.textContent = '';
			var btn = loginForm.querySelector('button[type=submit]');
			btn.disabled = true;
			var Username = usernameInput.value.trim();
			var Pw = passwordInput.value;
			jf('/Users/AuthenticateByName', { method: 'POST', auth: false, body: { Username: Username, Pw: Pw } })
				.then(function (result) {
					jellyfinSession.token = result.AccessToken;
					jellyfinSession.userId = result.User.Id;
					jellyfinSession.username = result.User.Name;
					jellyfinSession.itemId = currentItemId;
					jfSaveSession({
						token: jellyfinSession.token,
						userId: jellyfinSession.userId,
						username: jellyfinSession.username,
						itemId: currentItemId
					});
					return playWithSession(currentItemId);
				})
				.catch(function () {
					errorEl.textContent = 'LOGIN FAILED. Check your username and password.';
				})
				.then(function () {
					btn.disabled = false;
				});
		});

		// Same PlaybackInfo negotiation + stream/subtitle attach as app.js's
		// startPlayback, just addressed by itemId instead of a search result.
		function playWithSession(itemId) {
			itemId = itemId || currentItemId || JF_DEFAULT_ITEM_ID;
			errorEl.textContent = '';
			jfLine('LOCATE   > looking up item ' + itemId + '\u2026');
			return jf('/Items/' + encodeURIComponent(itemId) + '?fields=MediaSources,MediaStreams').then(function (itemData) {
				jfLine('LOCATE   > found "' + (itemData.Name || itemId) + '"');
				jfLine('LOCATE   > negotiating playback for this device\u2026');
				return jfNegotiatePlayback(itemId).then(function (playbackInfo) {
					var source = playbackInfo.MediaSources && playbackInfo.MediaSources[0];
					if (!source) throw new Error('Jellyfin returned no playable media source for this item.');

					var tracks = jfSubtitleTracks(itemId, source);
					jfLine('LOCATE   > ' + (source.SupportsDirectPlay ? 'direct play' : 'transcoding (HLS)') +
						' \u2014 ' + tracks.length + ' subtitle track(s)');
					jfLine('AUTOPLAY > starting stream\u2026');

					var streamUrl = jfResolveStreamUrl(itemId, source);
					video_selector.onerror = function () {
						errorEl.textContent = "Couldn't load stream. Ensure the Item ID matches your server's file and CORS is enabled.";
						jfLine('AUTOPLAY > failed \u2014 stream did not load');
						document.getElementById("wrapper-video").style.display = 'none';
						file_selector.style.display = 'flex';
					};

					document.getElementById("wrapper-video").style.display = 'block';

					return jfAttachStream(video_selector, streamUrl).then(function () {
						attachSubtitleTracks(video_selector, tracks);
						startPlayback();
					}).catch(function (err) {
						video_selector.onerror();
						throw err;
					});
				});
			}).catch(function (err) {
				var message = (err && err.message) ? err.message : "Couldn't load that title from Jellyfin.";
				jfLine('LOCATE   > failed \u2014 ' + message);
				errorEl.textContent = message;
				file_selector.style.display = 'flex';
				var jfTab = document.querySelector('.term-tab[data-tab="jellyfin"]');
				if (jfTab) jfTab.click();
			});
		}

		// Boot: same logic as app.js's boot() — if we already have a full
		// session, skip straight back into playback; if we only have a
		// server, skip straight to the login step.
		if (video_source_selector.getAttribute("src") == '' && jellyfinSession.server) {
			serverInput.value = jellyfinSession.server;
			if (itemIdInput && jellyfinSession.itemId) itemIdInput.value = jellyfinSession.itemId;
			var jfTab = document.querySelector('.term-tab[data-tab="jellyfin"]');
			if (jfTab) jfTab.click();
			if (jellyfinSession.token && jellyfinSession.userId) {
				jfLine('CONNECT  > ' + jellyfinSession.server + '  (remembered)');
				playWithSession(jellyfinSession.itemId || JF_DEFAULT_ITEM_ID).catch(function () {});
			} else {
				fetch(jellyfinSession.server + '/System/Info/Public').then(function (res) { return res.json(); }).then(function (info) {
					serverLabel.textContent = (info.ServerName || 'JELLYFIN') + ' \u2014 ' + jellyfinSession.server.replace(/^https?:\/\//, '');
					showLoginStep(jellyfinSession.itemId);
				}).catch(function () {});
			}
		}
	})();

	setupPlayerBar(video_selector);
	video_selector.ontimeupdate = ontimeupdate;

	var c = document.getElementById("c");
	c.ondblclick = toggleFullScreen;
	video_selector.onclick = function (e) {
		togglePlayPause();
		e.preventDefault();
	};

	document.onkeypress = function (e) {
		if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
		if (e.code == 'KeyF') toggleFullScreen();
		if (e.code == 'KeyR') playSegment(0);
		if (e.code == 'Space') togglePlayPause();
	};
	video_selector.onkeydown = function(e) {
		if (e.code == 'Space') e.preventDefault();
	};

	document.onkeydown = function (e) {
		if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
		if (e.key == 'ArrowLeft') jumpBack();
		if (e.key == 'ArrowRight') jumpForward();
		if (e.key == 'ArrowUp') video_selector.playbackRate *= 2.0;
		if (e.key == 'ArrowDown') video_selector.playbackRate /= 2.0;
	};

	window.onhashchange = function() {
		playHash(window.location.hash);
	};
};

function seek(ms) {
	document.getElementById("video").currentTime = ms / 1000.0;
	ontimeupdate(null);
}

function choice(choiceIndex) {
	nextChoice = choiceIndex;
	newList("choices");
	document.getElementById("choiceCaption").innerHTML = '';
	var stage = document.getElementById('choiceStage');
	if (stage) stage.classList.remove('is-active');
	if (!currentChoiceMoment.config.disableImmediateSceneTransition)
		playNextSegment(prevSegment);
}

function applyImpression(impressionData) {
	if (impressionData && impressionData.type == 'userState') {
		for (const [variable, value] of Object.entries(impressionData.data.persistent)) {
			let key = "persistentState_" + variable;
			ls[key] = JSON.stringify(value);
		}
	}
}

function playSegment(segmentId, noSeek) {
	if (!segmentId || typeof segmentId === "undefined")
		segmentId = segmentMap.initialSegment;
	var oldSegment = getSegmentId(getCurrentMs());
	if (!noSeek || oldSegment != segmentId) {
		var ms = getSegmentMs(segmentId);
		seek(ms);
		return true;
	}
	return false;
}

function reset() {
	ls.clear();
	location.hash = '';
	location.reload();
}

var lastHash = '';
function playHash(hash) {
	if (hash == lastHash) return;
	lastHash = hash;
	if (hash) {
		hash = hash.slice(1);
		if (hash[0] == 't')
			seek(Number(Math.round(hash.slice(1) * 1000.0)));
		else {
			let loc = hash.split('/');
			let segmentId = loc[0];
			if (loc.length > 1)
				seek(momentsBySegment[segmentId][loc[1]].startMs);
			else
				seek(getSegmentMs(segmentId));
		}
	}
}
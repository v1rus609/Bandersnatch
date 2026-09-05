/*
 * This is free and unencumbered software released into the public domain.
 *
 * Anyone is free to copy, modify, publish, use, compile, sell, or
 * distribute this software, either in source code form or as a compiled
 * binary, for any purpose, commercial or non-commercial, and by any
 * means.
 *
 * In jurisdictions that recognize copyright laws, the author or authors
 * of this software dedicate any and all copyright interest in the
 * software to the public domain. We make this dedication for the benefit
 * of the public at large and to the detriment of our heirs and
 * successors. We intend this dedication to be an overt act of
 * relinquishment in perpetuity of all present and future rights to this
 * software under copyright law.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
 * OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
 * ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 *
 * For more information, please refer to <http://unlicense.org>
 */

// Data
var segmentMap = SegmentMap;
var bv = bandersnatch.videos['80988062'].interactiveVideoMoments.value;
var choicePoints = bv.choicePointNavigatorMetadata.choicePointsMetadata.choicePoints;
var momentsBySegment = bv.momentsBySegment;
var segmentGroups = bv.segmentGroups;

// Transation of choices
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

// Persistent state
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
		console.log('unsupported condition!', cond);
		return 'true';
	}
}

function evalPrecondition(precondition, text) {
	if (precondition) {
		let cond = preconditionToJS(precondition);
		let match = eval(cond);
		console.log('precondition', text, ':', cond, '==', match);
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
	console.log('segment group', sg, '=>', results);
	return results[0];
}

/// Returns the segment ID at the given timestamp.
/// There will be exactly one segment for any timestamp within the video file.
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
		}else{
			a.textContent = text;
		}
		a.setAttribute('href', url);
		li.appendChild(a);
		ul.appendChild(li);
	}else{
		selectedDigits = []
		
		// Créer le conteneur des champs de saisie
		var inputContainer = document.createElement('div');
		inputContainer.className = 'input-container';

		// Créer les champs de saisie
		for (var i = 0; i < 5; i++) {
			var inputField = document.createElement('span');
			inputField.type = 'text';
			inputField.className = 'inputField';
			inputContainer.appendChild(inputField);
		}
		
		// Créer l'espace entre les conteneurs
		var lineBreak = document.createElement('br');
		inputContainer.appendChild(lineBreak.cloneNode());
		inputContainer.appendChild(lineBreak.cloneNode());

		// Créer le conteneur des boutons
		var buttonContainer = document.createElement('div');
		buttonContainer.className = 'buttonsCode';

		// Créer les éléments de la liste des boutons
		for (var i = 0; i < 10; i++) {
			var listItem = document.createElement('span');
			listItem.className = "buttonCodeNumber"
			listItem.textContent = i;
			listItem.setAttribute('onclick', 'selectDigit(' + i + ')');
			buttonContainer.appendChild(listItem);
		}

		// Ajouter les conteneurs au document
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
			var stopMs = z[1];
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
			} else{
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
	}else{
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
	console.log('momentStart', m, seeked);
	if (m.choices) {
		addChoices(m);
	}
	if (!seeked)
		applyImpression(m.impressionData);
}

function momentUpdate(m, ms) {
	//console.log('momentUpdate', m);
	if (m.choices) {
		var p = 100 - ((ms - m.startMs) * 100.0 / (m.endMs - m.startMs));
		document.getElementById("progress").style.width = p + '%';
	}
}

function momentEnd(m, seeked) {
	console.log('momentEnd', m, seeked);
	if (m.choices) {
		addChoices(null);
		document.getElementById("progress").style.width = 0;
	}
}

var timerId = 0;
var lastMs = 0;
var currentSegment;
var lastSegment = null;
var prevSegment = null; // for breadcrumbs
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

	// Distinguish between the user seeking manually with <video> controls,
	// and the video playing normally (past some timestamp / boundary).
	let timeElapsed = ms - lastMs;
	let seeked = timeElapsed < 0 || timeElapsed >= 2000;
	lastMs = ms;

	// Recalculate title and hash only when we pass some meaningful timestamp.
	let placeChanged = false;

	// Handle segment change
	if (lastSegment != currentSegment) {
		console.log('ontimeupdate', lastSegment, '->', currentSegment, ms, msToString(ms), seeked);
		prevSegment = lastSegment;
		lastSegment = currentSegment;
		if (!seeked && prevSegment) {
			if (playNextSegment(prevSegment)) {
				// playSegment decided to seek, which means that this
				// currentSegment is invalid, and a recursive
				// ontimeupdate invocation should have taken care of
				// things already. Return.
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
		let title = 'Bandersnatch';
		title += ' - Chapter ' + currentSegment;
		for (let k in currentMoments) {
			let m = currentMoments[k];
			if (m.type.substr(0, 6) == 'scene:') {
				if (m.id && m.id in choicePoints && choicePoints[m.id].description)
					title += ' - Choice "' + choicePoints[m.id].description + '"';
				else
					title += ' - Choice ' + (m.id || k);
			}
		}
		document.title = title;

		let hash = currentSegment;
		// Pick the moment which starts closer to the current timestamp.
		let bestMomentStart = segment ? segment.startTimeMs : 0;
		for (let k in currentMoments) {
			let m = currentMoments[k];
			if (m.startMs > bestMomentStart) {
				hash = k;
				bestMomentStart = m.startMs;
			}
		}
		hash = '#' + hash;
		lastHash = hash; // suppress onhashchange event
		location.hash = hash;
		ls.place = hash;
	}

	// ontimeupdate resolution is about a second. Augment it using timer.
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
		console.log('choice', nextChoice, 'nextSegment', nextSegment);
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
	// Find the earliest moment within this segment after cursor
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
	// Find the latest moment within this segment before cursor
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
			// Jump to last moment in previous segment
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
	console.log('toggleFullScreen');
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
// This player always points at one known Jellyfin item, so there's no
// need to ask for it in the UI.
var JELLYFIN_ITEM_ID = '4ed68723f27b3717298751e5ed578a43';

/* -----------------------------------------------------------------------
   Jellyfin session + auth
   Jellyfin expects every request — even ones carrying a valid token — to
   identify the calling client via an X-Emby-Authorization header. A bare
   ?api_key=... query param with no such header is what a static
   Dashboard-generated API key gave us before, and it got rejected outright
   (401) on this server. A real username/password login gets back a
   per-session AccessToken and, paired with that header, is what actually
   works against a real Jellyfin instance.
------------------------------------------------------------------------ */
var JELLYFIN_APP_NAME = 'BandersnatchPlayer';
var JELLYFIN_APP_VERSION = '1.0.0';

function jellyfinLoadSession() {
	try { return JSON.parse(window.localStorage.getItem('jellyfin_session')) || {}; }
	catch (e) { return {}; }
}
function jellyfinSaveSession(session) {
	try { window.localStorage.setItem('jellyfin_session', JSON.stringify(session)); }
	catch (e) {}
}
function jellyfinClearSession() {
	try { window.localStorage.removeItem('jellyfin_session'); } catch (e) {}
}

var jellyfinSession = jellyfinLoadSession();
if (!jellyfinSession.deviceId) {
	jellyfinSession.deviceId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random());
	jellyfinSaveSession(jellyfinSession);
}

function jellyfinAuthHeader() {
	return 'MediaBrowser Client="' + JELLYFIN_APP_NAME + '", Device="Web", DeviceId="' +
		jellyfinSession.deviceId + '", Version="' + JELLYFIN_APP_VERSION + '"';
}

// A page served over HTTPS (e.g. GitHub Pages) cannot fetch a plain HTTP
// server — browsers block it as "mixed content" before the request even
// leaves the machine. Checked up front so the error message says what's
// actually wrong instead of a generic network failure.
function jellyfinCheckMixedContent(server) {
	if (location.protocol === 'https:' && /^http:\/\//i.test(server)) {
		throw new Error(
			'This page is loaded over HTTPS, so the browser blocks requests to a ' +
			'plain HTTP server (mixed content). Put Jellyfin behind HTTPS ' +
			'(a reverse proxy with a certificate works), or open this player ' +
			'itself over HTTP/on your local network instead.'
		);
	}
}

// Generic authenticated Jellyfin request. Always sends the client-identity
// header Jellyfin requires; sends the session token too once we have one.
function jellyfinFetch(server, path, opts) {
	opts = opts || {};
	server = server.replace(/\/+$/, '');
	jellyfinCheckMixedContent(server);
	var headers = { 'Content-Type': 'application/json' };
	headers['X-Emby-Authorization'] = jellyfinAuthHeader();
	if (opts.token) headers['X-Emby-Token'] = opts.token;
	return fetch(server + path, {
		method: opts.method || 'GET',
		headers: headers,
		body: opts.body ? JSON.stringify(opts.body) : undefined
	}).then(function (res) {
		if (res.status === 401) {
			throw new Error(opts.token
				? 'Session expired or unauthorized (401) \u2014 please log in again.'
				: 'Unauthorized (401) \u2014 check the username and password.');
		}
		if (!res.ok) throw new Error(opts.method + ' ' + path + ' \u2192 ' + res.status);
		return res.text().then(function (text) { return text ? JSON.parse(text) : null; });
	});
}

// Confirms a server is reachable (no auth needed) and returns its public info.
function jellyfinPing(server) {
	server = server.replace(/\/+$/, '');
	jellyfinCheckMixedContent(server);
	return fetch(server + '/System/Info/Public').then(function (res) {
		if (!res.ok) throw new Error('Server responded with ' + res.status);
		return res.json();
	});
}

// Logs in with a username/password, returning { token, userId, username }.
function jellyfinLogin(server, username, password) {
	return jellyfinFetch(server, '/Users/AuthenticateByName', {
		method: 'POST',
		body: { Username: username, Pw: password }
	}).then(function (result) {
		return { token: result.AccessToken, userId: result.User.Id, username: result.User.Name };
	});
}

// Looks up item metadata (media/subtitle streams) from Jellyfin, using the
// logged-in session's token.
function fetchJellyfinItem(server, itemId, token) {
	return jellyfinFetch(server, '/Items/' + encodeURIComponent(itemId) + '?fields=MediaSources,MediaStreams', { token: token });
}

// Builds a direct-stream URL for a Jellyfin item.
// Uses the "static" stream endpoint so the original file container/codec is
// served as-is, which is what a plain <video> tag needs. <video>/<track>
// elements can't send custom headers, so the session token travels as the
// api_key query param here — that part was always fine; it's JSON calls
// like the item lookup above that need the header too.
function buildJellyfinUrl(server, itemId, token) {
	server = server.replace(/\/+$/, '');
	itemId = itemId.trim();
	var url = server + '/Videos/' + encodeURIComponent(itemId) + '/stream?static=true';
	if (token)
		url += '&api_key=' + encodeURIComponent(token);
	return url;
}

// Jellyfin will transcode any subtitle stream (embedded or external) to
// WebVTT on request via this endpoint, which is what lets a plain <track>
// element show them.
function buildJellyfinSubtitleTracks(server, itemId, token, itemData) {
	server = server.replace(/\/+$/, '');
	var source = (itemData.MediaSources && itemData.MediaSources[0]) || {};
	var mediaSourceId = source.Id || itemId;
	var streams = source.MediaStreams || itemData.MediaStreams || [];
	var tracks = [];
	streams.forEach(function (s) {
		if (s.Type !== 'Subtitle') return;
		var src = server + '/Videos/' + encodeURIComponent(itemId) + '/' +
			encodeURIComponent(mediaSourceId) + '/Subtitles/' + s.Index + '/Stream.vtt';
		if (token)
			src += '?api_key=' + encodeURIComponent(token);
		tracks.push({
			src: src,
			label: s.DisplayTitle || s.Language || ('Subtitle ' + s.Index),
			srclang: s.Language || 'en',
			isDefault: !!s.IsDefault
		});
	});
	return tracks;
}

// Replaces any dynamically-added <track> elements on the video with a new
// set. Used for both Jellyfin subtitle streams and a locally loaded
// subtitle file.
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

		// Browsers only reliably honor the "default" attribute on <track>
		// elements that are present when the page is first parsed. One
		// appended via script after the video already exists (which is
		// every case here) is added in "disabled" mode regardless of the
		// default attribute, so cues never render even though the track
		// loaded fine. Set .mode explicitly to fix that.
		var tt = trackEl.track;
		if (tt) tt.mode = t.isDefault ? 'showing' : 'hidden';
	});
}

// Best-effort SRT -> WebVTT conversion: swaps the comma decimal separator
// for a period and drops the numeric cue-index lines. Good enough for the
// vast majority of subtitle files found for this kind of release.
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

// Wires up the custom bottom control bar: play/pause, +/-10s, seek,
// volume, subtitle-track picker, and fullscreen. Purely a presentation
// layer on top of the existing <video> element and helpers (seek(),
// getCurrentMs(), toggleFullScreen(), togglePlayPause()) — none of the
// interactive-video logic changes.
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

	btnPlayPause.addEventListener('click', function () {
		togglePlayPause();
	});
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

	// Auto-hide the bar during playback; keep it up while paused or hovered.
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
		console.log('no video');
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

	// Optional local subtitle file (.vtt or .srt) for the local-file tab.
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

	// Jellyfin playback: connect to a server, then log in with a real
	// username/password (not a static API key — see the comments above
	// jellyfinFetch for why that approach was rejected).
	(function () {
		var connectForm = document.getElementById('jellyfin-connect-form');
		var loginForm = document.getElementById('jellyfin-login-form');
		if (!connectForm || !loginForm) return;

		var serverInput = document.getElementById('jf-server');
		var connectErrorEl = document.getElementById('jf-connect-error');
		var serverLabel = document.getElementById('jf-server-label');
		var usernameInput = document.getElementById('jf-username');
		var passwordInput = document.getElementById('jf-password');
		var rememberInput = document.getElementById('jf-remember');
		var errorEl = document.getElementById('jf-error');
		var backBtn = document.getElementById('jf-back');
		var jfLog = document.getElementById('jf-boot-log');
		var itemId = JELLYFIN_ITEM_ID;
		var currentServer = '';

		function jfLine(text) {
			if (!jfLog) return;
			jfLog.textContent += (jfLog.textContent ? '\n' : '') + text;
		}
		function jfReset() {
			if (jfLog) jfLog.textContent = '';
		}
		function wait(ms) {
			return new Promise(function (resolve) { setTimeout(resolve, ms); });
		}

		function showLoginStep(server) {
			currentServer = server;
			serverLabel.textContent = server.replace(/^https?:\/\//, '');
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

		connectForm.addEventListener('submit', function (e) {
			e.preventDefault();
			connectErrorEl.textContent = '';
			var server = serverInput.value.trim().replace(/\/+$/, '');
			if (server && !/^https?:\/\//i.test(server)) server = 'http://' + server;
			if (!server) {
				connectErrorEl.textContent = 'Server URL is required.';
				return;
			}
			jfReset();
			jfLine('CONNECT  > ' + server);
			jellyfinPing(server).then(function () {
				jfLine('CONNECT  > ok');
				showLoginStep(server);
			}).catch(function (err) {
				var message = (err && err.message) ? err.message : 'Could not reach that server.';
				jfLine('CONNECT  > failed \u2014 ' + message);
				connectErrorEl.textContent = message;
			});
		});

		// LOCATE (confirm the title + pull subtitle streams) then AUTOPLAY,
		// once we have a valid session token for the server.
		function playWithSession(server, token) {
			errorEl.textContent = '';
			jfLine('LOCATE   > looking up title\u2026');
			return fetchJellyfinItem(server, itemId, token).then(function (itemData) {
				var name = itemData.Name || 'title';
				var year = itemData.ProductionYear ? ' (' + itemData.ProductionYear + ')' : '';
				jfLine('LOCATE   > found "' + name + '"' + year);

				var tracks = buildJellyfinSubtitleTracks(server, itemId, token, itemData);
				jfLine('LOCATE   > ' + tracks.length + ' subtitle track(s)');

				return wait(300).then(function () {
					jfLine('AUTOPLAY > starting stream\u2026');

					var streamUrl = buildJellyfinUrl(server, itemId, token);
					video_selector.onerror = function () {
						errorEl.textContent = "Couldn't load that stream. The server accepted the login, but the video itself didn't play — check that the item ID matches your Bandersnatch file and that the format can direct-play in this browser.";
						jfLine('AUTOPLAY > failed \u2014 stream did not load');
						document.getElementById("wrapper-video").style.display = 'none';
						file_selector.style.display = 'flex';
					};
					attachSubtitleTracks(video_selector, tracks);
					video_selector.src = streamUrl;
					document.getElementById("wrapper-video").style.display = 'block';

					return wait(250).then(startPlayback);
				});
			}).catch(function (err) {
				console.log('Jellyfin playback failed', err);
				var message = (err && err.message) ? err.message : "Couldn't load that title from Jellyfin.";
				jfLine('LOCATE   > failed \u2014 ' + message);
				errorEl.textContent = message;
				file_selector.style.display = 'flex';
				var jfTab = document.querySelector('.term-tab[data-tab="jellyfin"]');
				if (jfTab) jfTab.click();
			});
		}

		loginForm.addEventListener('submit', function (e) {
			e.preventDefault();
			errorEl.textContent = '';
			var username = usernameInput.value.trim();
			var password = passwordInput.value;
			if (!username) {
				errorEl.textContent = 'Username is required.';
				return;
			}
			jfLine('LOGIN    > ' + username);
			jellyfinLogin(currentServer, username, password).then(function (result) {
				jfLine('LOGIN    > ok');
				jellyfinSession.token = result.token;
				jellyfinSession.userId = result.userId;
				jellyfinSession.username = result.username;
				if (rememberInput.checked) {
					jellyfinSession.server = currentServer;
					jellyfinSaveSession(jellyfinSession);
				} else {
					jellyfinClearSession();
					// deviceId still needs to persist even when the rest doesn't,
					// so Jellyfin sees a consistent device across visits.
					jellyfinSaveSession({ deviceId: jellyfinSession.deviceId });
				}
				return playWithSession(currentServer, result.token);
			}).catch(function (err) {
				var message = (err && err.message) ? err.message : 'Login failed \u2014 check the username and password.';
				jfLine('LOGIN    > failed \u2014 ' + message);
				errorEl.textContent = message;
			});
		});

		// This is your own personal deployment pointed at a single, known
		// live server — if a session was remembered and still works, skip
		// straight to playback with no clicks needed. If the token has
		// expired, fall back to the login screen instead of a dead end.
		if (video_source_selector.getAttribute("src") == '' && jellyfinSession.server && jellyfinSession.token) {
			serverInput.value = jellyfinSession.server;
			jfLine('CONNECT  > ' + jellyfinSession.server + '  (remembered)');
			playWithSession(jellyfinSession.server, jellyfinSession.token).catch(function () {
				// playWithSession already reports the error and reopens the tab;
				// nothing further to do here.
			});
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
		if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
			return;
		if (e.code == 'KeyF')
			toggleFullScreen();
		if (e.code == 'KeyR')
			playSegment(0);
		if (e.code == 'Space')
			togglePlayPause();
	};
	video_selector.onkeydown = function(e) {
		if (e.code == 'Space')
			e.preventDefault();
	};

	document.onkeydown = function (e) {
		if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
			return;
		if (e.key == 'ArrowLeft')
			jumpBack();
		if (e.key == 'ArrowRight')
			jumpForward();
		if (e.key == 'ArrowUp')
			video_selector.playbackRate = video_selector.playbackRate * 2.0;
		if (e.key == 'ArrowDown')
			video_selector.playbackRate = video_selector.playbackRate / 2.0;
	};

	window.onhashchange = function() {
		playHash(window.location.hash);
	};
};

function seek(ms) {
	console.log('seek', ms);
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
			console.log('persistentState set', variable, '=', value, '(was', key in ls ? ls[key] : 'unset', ')');
			ls[key] = JSON.stringify(value);
		}
	}
}

function playSegment(segmentId, noSeek) {
	if (!segmentId || typeof segmentId === "undefined")
		segmentId = segmentMap.initialSegment;
	var oldSegment = getSegmentId(getCurrentMs());
	console.log('playSegment', oldSegment, '->', segmentId);
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
	// console.log('playHash', lastHash, '->', hash);
	if (hash == lastHash)
		return;
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

// Minimal fake <video> + fake requestAnimationFrame-free environment to
// drive BandersnatchEngine through several playthroughs and sanity-check
// that it always makes forward progress and eventually reaches an ending.
global.window = global;

const fs = require('fs');
const path = require('path');
const dir = '/home/claude/bandersnatch-player';

require(path.join(dir, 'segment-map.js'));
require(path.join(dir, 'story-data.js'));
eval(fs.readFileSync(path.join(dir, 'segment-engine.js'), 'utf8') + '\nglobal.BandersnatchEngine = BandersnatchEngine;');

function makeFakeVideo() {
  const listeners = {};
  const v = {
    _currentTime: 0,
    paused: true,
    duration: 99999,
    get currentTime() { return this._currentTime; },
    set currentTime(t) {
      this._currentTime = t;
      // Simulate the browser firing 'seeked' once the (instant, in this
      // mock) seek completes.
      (listeners['seeked'] || []).slice().forEach(fn => fn());
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter(f => f !== fn);
    },
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    _fireTimeUpdate() { (listeners['timeupdate'] || []).forEach(fn => fn()); },
  };
  return v;
}

function runPlaythrough(choiceStrategy, label) {
  const video = makeFakeVideo();
  const visitedSegments = [];
  const cuts = [];
  let choiceCount = 0;
  let finished = false;
  let finishReason = null;
  let errors = [];

  const engine = new BandersnatchEngine(video, SegmentMap, STORY_DATA, {
    onSegmentChange: (id) => visitedSegments.push(id),
    onCut: () => cuts.push(video.currentTime),
    onChoice: (title, options, msRemaining, select) => {
      choiceCount++;
      if (choiceCount > 500) { errors.push('choice storm — likely infinite loop'); finished = true; return; }
      const idx = choiceStrategy(options, choiceCount);
      select(idx);
    },
    onChoiceClear: () => {},
    onStoryEnd: () => {},
    onCredits: (id) => { finished = true; finishReason = 'credits @ ' + id; },
    onFinished: () => { finished = true; finishReason = 'dead-end (no next)'; },
  });

  engine.start();

  // Advance playback in small increments, like real timeupdate events
  // (~250ms), for up to a simulated 6 hours of content or until we finish.
  const stepMs = 200;
  let guard = 0;
  while (!finished && guard < 6 * 60 * 60 * 1000 / stepMs) {
    guard++;
    if (video.paused) {
      // engine is mid-seek (paused while waiting for 'seeked', which our
      // mock fires synchronously) — shouldn't normally stay paused here,
      // but guard against a stuck state.
      video.play();
    }
    video._currentTime += stepMs / 1000;
    video._fireTimeUpdate();
  }

  console.log(`[${label}] segments visited: ${visitedSegments.length}, cuts: ${cuts.length}, choices: ${choiceCount}, finished: ${finished} (${finishReason || 'DID NOT FINISH'}), ticks: ${guard}`);
  if (errors.length) console.log('  ERRORS:', errors);
  if (!finished) console.log('  last few segments:', visitedSegments.slice(-10));
  return { visitedSegments, cuts, choiceCount, finished, finishReason, errors };
}

console.log('total segments in map:', Object.keys(SegmentMap.segments).length);
console.log('---');

runPlaythrough((options) => 0, 'always pick option 0');
runPlaythrough((options) => options.length - 1, 'always pick last option');
runPlaythrough((options, n) => n % options.length, 'round robin');
runPlaythrough((options) => Math.floor(Math.random() * options.length), 'random 1');
runPlaythrough((options) => Math.floor(Math.random() * options.length), 'random 2');

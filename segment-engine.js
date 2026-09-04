/**
 * BandersnatchEngine
 * ---------------------------------------------------------------
 * Drives a <video> element through a branching segment graph.
 *
 * Data model (from SegmentMap.js, unmodified):
 *   segments[id] = {
 *     startTimeMs, endTimeMs,
 *     next: { targetId: { weight }, ... },
 *     defaultNext: targetId,
 *     ui: { interactionZones: [[startMs, endMs], ...] }  // present ONLY
 *          on real user-facing choice points. Segments with multiple
 *          `next` options but no `ui` are silent variety branches —
 *          the film picks one at random and cuts to it seamlessly,
 *          the viewer never sees a choice.
 *     storyEnd: true   // this branch has reached a narrative ending
 *     credits: true    // this segment is a credits roll
 *   }
 *
 * choiceLabels[segmentId] = {
 *   title: "Which Record?",
 *   options: [{ label: "PHAEDRA", targets: ["1R"] }, ...]
 * }
 * A single visible choice can fan out into more than one underlying
 * segment (Netflix layered small random variety under some choices) —
 * `targets` is a list, resolved with the same weights as `next` at
 * selection time.
 *
 * Seeking: every jump (branch or manual scrub) goes through
 * `_seekTo`, which pauses, waits for the real `seeked` event, and
 * only then resumes playback. This avoids the classic "video freezes
 * but audio keeps going" artifact, which happens when playback is
 * resumed before the decoder has actually landed on the new frame.
 */
class BandersnatchEngine {
  constructor(video, segmentMap, choiceLabels, callbacks) {
    this.video = video;
    this.segments = segmentMap.segments;
    this.initialSegment = segmentMap.initialSegment;
    this.choiceLabels = choiceLabels || {};
    this.cb = callbacks || {};

    this.currentId = null;
    this.choiceActive = false;
    this.seeking = false;
    this.shownZones = new Set(); // "segmentId:zoneIndex" already shown
    this.countdownRAF = null;

    this._onTimeUpdate = this._onTimeUpdate.bind(this);
  }

  start() {
    this.video.addEventListener('timeupdate', this._onTimeUpdate);
    this._jumpTo(this.initialSegment, { cut: false });
  }

  destroy() {
    this.video.removeEventListener('timeupdate', this._onTimeUpdate);
    if (this.countdownRAF) cancelAnimationFrame(this.countdownRAF);
  }

  _currentNode() {
    return this.segments[this.currentId];
  }

  _onTimeUpdate() {
    if (this.choiceActive || this.seeking) return;
    const node = this._currentNode();
    if (!node) return;
    const tMs = this.video.currentTime * 1000;

    if (node.ui && node.ui.interactionZones) {
      node.ui.interactionZones.forEach((zone, i) => {
        const key = this.currentId + ':' + i;
        if (tMs >= zone[0] && tMs < zone[1] && !this.shownZones.has(key)) {
          this.shownZones.add(key);
          this._triggerChoice(node, zone[1] - tMs);
        }
      });
    }

    if (tMs >= node.endTimeMs - 40 && !this.choiceActive) {
      this._autoAdvance(node);
    }
  }

  _triggerChoice(node, msRemaining) {
    const nextIds = Object.keys(node.next || {});
    if (nextIds.length < 2) return;
    this.choiceActive = true;

    const meta = this.choiceLabels[this.currentId];
    const title = meta && meta.title ? meta.title : 'Choose';
    const options = meta && meta.options && meta.options.length
      ? meta.options
      : nextIds.map((id, i) => ({ label: `Option ${i + 1}`, targets: [id] }));

    const resolve = (targets) => this._weightedPickFrom(node.next, targets);

    const select = (targets) => {
      if (!this.choiceActive) return;
      this.choiceActive = false;
      if (this.countdownRAF) cancelAnimationFrame(this.countdownRAF);
      this.cb.onChoiceClear && this.cb.onChoiceClear();
      this._jumpTo(resolve(targets), { cut: true });
    };

    this.cb.onChoice && this.cb.onChoice(title, options, msRemaining, select);

    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const remaining = Math.max(0, msRemaining - elapsed);
      this.cb.onChoiceTick && this.cb.onChoiceTick(remaining / msRemaining);
      if (remaining <= 0) {
        const fallback = options.find(o => o.targets.includes(node.defaultNext)) || options[0];
        select(fallback.targets);
        return;
      }
      this.countdownRAF = requestAnimationFrame(tick);
    };
    this.countdownRAF = requestAnimationFrame(tick);
  }

  _autoAdvance(node) {
    const nextIds = Object.keys(node.next || {});
    if (nextIds.length === 0) {
      if (node.credits) { this.cb.onCredits && this.cb.onCredits(this.currentId); return; }
      this.cb.onFinished && this.cb.onFinished();
      return;
    }
    if (node.storyEnd) {
      this.cb.onStoryEnd && this.cb.onStoryEnd(this.currentId);
    }
    const targetId = this._weightedPick(node.next) || node.defaultNext || nextIds[0];
    this._jumpTo(targetId, { cut: true });
  }

  _weightedPick(nextMap) {
    const entries = Object.entries(nextMap);
    const total = entries.reduce((sum, [, v]) => sum + (v.weight || 1), 0);
    let r = Math.random() * total;
    for (const [id, v] of entries) {
      r -= (v.weight || 1);
      if (r <= 0) return id;
    }
    return entries[entries.length - 1][0];
  }

  /** Weighted pick restricted to a subset of ids (a chosen option's targets). */
  _weightedPickFrom(nextMap, allowedIds) {
    const entries = Object.entries(nextMap).filter(([id]) => allowedIds.includes(id));
    if (entries.length === 0) return allowedIds[0];
    if (entries.length === 1) return entries[0][0];
    return this._weightedPick(Object.fromEntries(entries));
  }

  /** Find which segment "owns" a given absolute video timestamp (ms). */
  _segmentAtTime(ms) {
    for (const id in this.segments) {
      const s = this.segments[id];
      if (ms >= s.startTimeMs && ms < (s.endTimeMs ?? Infinity)) return id;
    }
    return null;
  }

  /**
   * Manual scrub / skip. Jumps the underlying video to an arbitrary
   * timestamp and re-syncs the branching state to whichever segment
   * owns that timestamp, so branching logic stays correct afterwards.
   */
  seekToTime(ms) {
    if (this.choiceActive) {
      this.choiceActive = false;
      if (this.countdownRAF) cancelAnimationFrame(this.countdownRAF);
      this.cb.onChoiceClear && this.cb.onChoiceClear();
    }
    const id = this._segmentAtTime(ms) || this.currentId;
    this.currentId = id;
    this._seekTo(ms / 1000).then(() => {
      this.cb.onSegmentChange && this.cb.onSegmentChange(id, this.segments[id]);
    });
  }

  _jumpTo(segmentId, { cut }) {
    const node = this.segments[segmentId];
    if (!node) { this.cb.onFinished && this.cb.onFinished(); return; }
    this.currentId = segmentId;
    if (cut) this.cb.onCut && this.cb.onCut();
    this.cb.onSegmentChange && this.cb.onSegmentChange(segmentId, node);
    if (node.credits) this.cb.onCredits && this.cb.onCredits(segmentId);
    this._seekTo(node.startTimeMs / 1000);
  }

  /** Pause, seek, wait for the real `seeked` event, then resume. */
  _seekTo(targetSeconds) {
    if (Math.abs(this.video.currentTime - targetSeconds) < 0.15) {
      if (this.video.paused) this.video.play().catch(() => {});
      return Promise.resolve();
    }
    this.seeking = true;
    const wasPlaying = !this.video.paused;
    this.video.pause();
    this.video.currentTime = targetSeconds;
    return new Promise((resolve) => {
      const done = () => {
        this.video.removeEventListener('seeked', done);
        this.seeking = false;
        if (wasPlaying) this.video.play().catch(() => {});
        resolve();
      };
      this.video.addEventListener('seeked', done);
      // Safety net: some browsers/streams don't reliably fire `seeked`.
      setTimeout(done, 1500);
    });
  }
}

/**
 * BandersnatchEngine
 * Drives <video> playback through the branching segment graph.
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
    this.isSeeking = false;
    this.shownZones = new Set();
    this.countdownRAF = null;

    this._onTimeUpdate = this._onTimeUpdate.bind(this);
    this._onSeeked = this._onSeeked.bind(this);
    this._onWaiting = this._onWaiting.bind(this);
  }

  start() {
    this.video.addEventListener('timeupdate', this._onTimeUpdate);
    this.video.addEventListener('seeked', this._onSeeked);
    this.video.addEventListener('waiting', this._onWaiting);
    this._jumpTo(this.initialSegment, { cut: false });
  }

  destroy() {
    this.video.removeEventListener('timeupdate', this._onTimeUpdate);
    this.video.removeEventListener('seeked', this._onSeeked);
    this.video.removeEventListener('waiting', this._onWaiting);
    if (this.countdownRAF) cancelAnimationFrame(this.countdownRAF);
  }

  _onSeeked() {
    this.isSeeking = false;
  }

  _onWaiting() {
    // If video decoder stalls while audio keeps playing, briefly resync
    if (!this.video.paused && this.video.readyState < 3) {
      this.isSeeking = true;
    }
  }

  _currentNode() {
    return this.segments[this.currentId];
  }

  _onTimeUpdate() {
    if (this.choiceActive || this.isSeeking) return;
    const node = this._currentNode();
    if (!node) return;
    const tMs = this.video.currentTime * 1000;

    // Check interaction zones for choice triggers
    if (node.ui && node.ui.interactionZones) {
      node.ui.interactionZones.forEach((zone, i) => {
        const key = this.currentId + ':' + i;
        if (tMs >= zone[0] && tMs < zone[1] && !this.shownZones.has(key)) {
          this.shownZones.add(key);
          this._triggerChoice(node, zone[1] - tMs);
        }
      });
    }

    // Auto-advance segment
    if (tMs >= node.endTimeMs - 60 && !this.choiceActive) {
      this._autoAdvance(node);
    }
  }

  _triggerChoice(node, msRemaining) {
    const nextIds = Object.keys(node.next || {});
    if (nextIds.length < 2) return;
    this.choiceActive = true;

    const meta = this.choiceLabels[this.currentId];
    const title = meta ? meta.title : 'Choose';
    const options = nextIds.map((id, i) => ({
      target: id,
      label: (meta && meta.options && meta.options[i]) ? meta.options[i].label : `Option ${i + 1}`,
    }));

    const select = (targetId) => {
      if (!this.choiceActive) return;
      this.choiceActive = false;
      if (this.countdownRAF) cancelAnimationFrame(this.countdownRAF);
      this.cb.onChoiceClear && this.cb.onChoiceClear();
      this._jumpTo(targetId, { cut: true });
    };

    this.cb.onChoice && this.cb.onChoice(title, options, msRemaining, select);

    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const remaining = Math.max(0, msRemaining - elapsed);
      if (remaining <= 0) {
        select(node.defaultNext || nextIds[0]);
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

  _jumpTo(segmentId, { cut }) {
    const node = this.segments[segmentId];
    if (!node) { this.cb.onFinished && this.cb.onFinished(); return; }
    this.currentId = segmentId;
    if (cut) this.cb.onCut && this.cb.onCut();
    
    const target = node.startTimeMs / 1000;
    // Avoid small sub-second seeks that drop frames and trigger audio-video drift
    if (Math.abs(this.video.currentTime - target) > 0.45) {
      this.isSeeking = true;
      this.video.currentTime = target;
    }

    if (this.video.paused) {
      this.video.play().catch(() => {});
    }
    this.cb.onSegmentChange && this.cb.onSegmentChange(segmentId, node);
    if (node.credits) this.cb.onCredits && this.cb.onCredits(segmentId);
  }
}
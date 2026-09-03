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
 * The engine never pauses the video for silent branches. For real
 * choice points, playback continues (matching the source material)
 * while a choice UI is shown with a countdown; if nothing is picked
 * before the interaction zone ends, `defaultNext` is used.
 */
class BandersnatchEngine {
  /**
   * @param {HTMLVideoElement} video
   * @param {object} segmentMap   the global SegmentMap object
   * @param {object} choiceLabels the global CHOICE_LABELS object
   * @param {object} callbacks
   *   onChoice(title, options, msRemaining, select)
   *   onChoiceClear()
   *   onCut()                      -- called right as we jump to a new segment
   *   onSegmentChange(segmentId, segmentNode)
   *   onStoryEnd(segmentId)
   *   onCredits(segmentId)
   *   onFinished()                 -- reached a dead-end (no next)
   */
  constructor(video, segmentMap, choiceLabels, callbacks) {
    this.video = video;
    this.segments = segmentMap.segments;
    this.initialSegment = segmentMap.initialSegment;
    this.choiceLabels = choiceLabels || {};
    this.cb = callbacks || {};

    this.currentId = null;
    this.choiceActive = false;
    this.shownZones = new Set(); // "segmentId:zoneIndex" already shown, avoid re-trigger
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
    if (this.choiceActive) return;
    const node = this._currentNode();
    if (!node) return;
    const tMs = this.video.currentTime * 1000;

    // Real, user-facing choice point.
    if (node.ui && node.ui.interactionZones) {
      node.ui.interactionZones.forEach((zone, i) => {
        const key = this.currentId + ':' + i;
        if (tMs >= zone[0] && tMs < zone[1] && !this.shownZones.has(key)) {
          this.shownZones.add(key);
          this._triggerChoice(node, zone[1] - tMs);
        }
      });
    }

    // Reached (or passed) the end of this segment without a choice
    // firing (either no ui, or ui already resolved) -> auto-advance.
    if (tMs >= node.endTimeMs - 40 && !this.choiceActive) {
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
      label: (meta && meta.options[i]) ? meta.options[i].label : `Option ${i + 1}`,
    }));

    const select = (targetId) => {
      if (!this.choiceActive) return; // already resolved (e.g. timeout raced a click)
      this.choiceActive = false;
      if (this.countdownRAF) cancelAnimationFrame(this.countdownRAF);
      this.cb.onChoiceClear && this.cb.onChoiceClear();
      this._jumpTo(targetId, { cut: true });
    };

    this.cb.onChoice && this.cb.onChoice(title, options, msRemaining, select);

    // countdown -> defaultNext if nothing picked
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const remaining = Math.max(0, msRemaining - elapsed);
      this.cb.onChoiceTick && this.cb.onChoiceTick(remaining / msRemaining);
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
      // still continue automatically into whatever comes next (the film
      // rolls into a splitscreen/credits segment on its own)
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
    if (Math.abs(this.video.currentTime - target) > 0.35) {
      this.video.currentTime = target;
    }
    if (this.video.paused) this.video.play().catch(() => {});
    this.cb.onSegmentChange && this.cb.onSegmentChange(segmentId, node);
    if (node.credits) this.cb.onCredits && this.cb.onCredits(segmentId);
  }
}

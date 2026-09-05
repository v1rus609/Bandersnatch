/**
 * BandersnatchEngine
 * ---------------------------------------------------------------
 * This is a port of the actual algorithm the film's data was built
 * for (verified against a public-domain reference client), not a
 * re-derived approximation. The earlier version of this engine used
 * weighted-random picks over SegmentMap's `next` map — that was
 * wrong; `next`/weights are informational only and never consulted
 * by real playback logic. The real algorithm is precondition/state
 * driven:
 *
 *  - `momentsBySegment[segmentId]` lists timed "moments" within a
 *    segment (own startMs/endMs, NOT SegmentMap's interactionZones).
 *    A moment may carry a `precondition` (only relevant if state
 *    matches) and `impressionData` (state to write when it plays).
 *  - A choice moment (`m.choices`) shows options; each option targets
 *    either a literal `segmentId` or a named `sg` (segment group).
 *  - `segmentGroups[name]` is an ORDERED list resolved by taking the
 *    first entry whose precondition passes (not random) — this is
 *    how "remembered" earlier choices silently redirect later scenes.
 *  - Picking a choice sets a pending selection. Most choices cut
 *    immediately; some (`config.disableImmediateSceneTransition`)
 *    wait until the segment naturally ends.
 *  - At every real segment boundary crossing, the pending choice (or
 *    `defaultNext`) resolves the jump.
 *
 * State (persistentState) is seeded from STORY_DATA.initialState and
 * mutated by impressionData as the story plays, exactly like the
 * reference client — this is what makes "remembered" branches work.
 */
class BandersnatchEngine {
  constructor(video, segmentMap, storyData, callbacks) {
    this.video = video;
    this.segments = segmentMap.segments;
    this.initialSegment = segmentMap.initialSegment;
    this.momentsBySegment = storyData.momentsBySegment;
    this.segmentGroups = storyData.segmentGroups;
    this.preconditions = storyData.preconditions;
    this.choiceTitles = storyData.choiceTitles || {};
    this.cb = callbacks || {};

    this.state = { ...storyData.initialState };

    this.currentSegmentId = null;
    this.prevSegmentId = null;
    this.lastMs = 0;
    this.lastMoments = {};           // momentId -> moment, currently active
    this.pendingChoiceIndex = -1;    // -1 = nothing pending
    this.currentChoiceMoment = null;
    this.seeking = false;
    this.forceSeeked = false; // set after any programmatic seek so the next real tick treats it as a jump, not natural playback

    this._onTimeUpdate = this._onTimeUpdate.bind(this);
  }

  start() {
    this.video.addEventListener('timeupdate', this._onTimeUpdate);
    this._playSegment(this.initialSegment);
  }

  destroy() {
    this.video.removeEventListener('timeupdate', this._onTimeUpdate);
  }

  /* ---------------- precondition evaluation ---------------- */
  _evalCond(cond) {
    if (cond === true || cond === false) return cond;
    if (typeof cond === 'string') return cond; // literal value (used inside eql)
    if (!Array.isArray(cond)) return true; // no condition = always true
    const [op, ...args] = cond;
    switch (op) {
      case 'persistentState': return this.state[args[0]];
      case 'not': return !this._evalCond(args[0]);
      case 'and': return args.every(a => this._evalCond(a));
      case 'or': return args.some(a => this._evalCond(a));
      case 'eql': return this._evalCond(args[0]) === this._evalCond(args[1]);
      default: return true;
    }
  }
  _checkPreconditionId(id) {
    const cond = this.preconditions[id];
    return cond === undefined ? true : this._evalCond(cond);
  }
  _evalPrecondition(precondition) {
    return precondition ? this._evalCond(precondition) : true;
  }

  _applyImpression(impressionData) {
    if (impressionData && impressionData.type === 'userState') {
      Object.assign(this.state, impressionData.data.persistent);
    }
  }

  /* ---------------- segment group resolution ---------------- */
  _resolveSegmentGroup(name) {
    const list = this.segmentGroups[name];
    if (!list) return null;
    // First entry whose precondition passes wins (not random).
    for (const v of list) {
      if (v && typeof v === 'object') {
        if (v.precondition && !this._checkPreconditionId(v.precondition)) continue;
        if (v.segmentGroup) return this._resolveSegmentGroup(v.segmentGroup);
        if (v.segment) return v.segment;
      } else {
        // Plain string: normally just a segment id (ungated) — real
        // gated entries are the {segment, precondition} object form
        // above. checkPreconditionId returns true when there's no
        // precondition registered under that id, which is the norm.
        if (this._checkPreconditionId(v)) return v;
      }
    }
    return null;
  }

  /* ---------------- segment / moment lookups ---------------- */
  _segmentIdAt(ms) {
    for (const id in this.segments) {
      const s = this.segments[id];
      if (ms >= s.startTimeMs && (!s.endTimeMs || ms < s.endTimeMs)) return id;
    }
    return null;
  }

  _momentsAt(segmentId, ms) {
    const result = {};
    const moments = this.momentsBySegment[segmentId] || [];
    moments.forEach((m, i) => {
      if (ms >= m.startMs && ms < m.endMs && this._evalPrecondition(m.precondition)) {
        result[segmentId + '/' + i] = m;
      }
    });
    return result;
  }

  /* ---------------- core loop ---------------- */
  _onTimeUpdate() {
    if (this.seeking) return;
    const ms = Math.round(this.video.currentTime * 1000);
    const currentSegmentId = this._segmentIdAt(ms);
    if (currentSegmentId === null) return;

    const elapsed = ms - this.lastMs;
    const seeked = this.forceSeeked || elapsed < 0 || elapsed >= 2000; // manual scrub, or our own programmatic seek, vs natural playback
    this.forceSeeked = false;
    this.lastMs = ms;

    if (this.currentSegmentId !== currentSegmentId) {
      const prevId = this.currentSegmentId;
      if (!seeked && prevId) {
        if (this._playNextSegment(prevId)) return; // jumped — _playSegment already updated bookkeeping + fired onSegmentChange
      }
      // Landed here naturally (or this crossing was itself a seek we
      // don't otherwise own bookkeeping for) — just accept it.
      this.prevSegmentId = prevId;
      this.currentSegmentId = currentSegmentId;
      this._notifySegmentChange(currentSegmentId, this.segments[currentSegmentId]);
    }

    const currentMoments = this._momentsAt(currentSegmentId, ms);

    for (const k in this.lastMoments) {
      if (!(k in currentMoments)) this._momentEnd(this.lastMoments[k]);
    }
    for (const k in currentMoments) {
      if (!(k in this.lastMoments)) this._momentStart(currentMoments[k], seeked);
      else this._momentUpdate(currentMoments[k], ms);
    }
    this.lastMoments = currentMoments;
  }

  _momentStart(m, seeked) {
    if (m.choices) this._showChoice(m);
    if (!seeked) this._applyImpression(m.impressionData);
  }

  _momentUpdate(m, ms) {
    if (m.choices) {
      const remaining = m.endMs - ms;
      this.cb.onChoiceTick && this.cb.onChoiceTick(Math.max(0, remaining / (m.endMs - m.startMs)));
    }
  }

  _momentEnd(m) {
    if (m.choices) {
      this.pendingChoiceIndex = -1;
      this.currentChoiceMoment = null;
      this.cb.onChoiceClear && this.cb.onChoiceClear();
    }
  }

  _showChoice(m) {
    this.currentChoiceMoment = m;
    this.pendingChoiceIndex = m.defaultChoiceIndex ?? 0;
    const title = this.choiceTitles[m.id] || 'Choose';
    const options = m.choices.map((c, i) => ({ label: c.text, index: i }));
    const select = (index) => this._choose(index);
    this.cb.onChoice && this.cb.onChoice(title, options, m.endMs - (this.video.currentTime * 1000), select);
  }

  /** User clicked an option (or the engine can call with the default on timeout). */
  _choose(index) {
    if (!this.currentChoiceMoment) return;
    this.pendingChoiceIndex = index;
    this.cb.onChoiceClear && this.cb.onChoiceClear();
    const immediate = !(this.currentChoiceMoment.config && this.currentChoiceMoment.config.disableImmediateSceneTransition);
    if (immediate) {
      this._playNextSegment(this.currentSegmentId);
    }
    // else: stays pending, resolved naturally when the segment ends.
  }

  /** Resolve + jump to whatever comes after `fromSegmentId`. Returns true if a seek was issued. */
  _playNextSegment(fromSegmentId) {
    let nextSegment = null;

    if (this.pendingChoiceIndex >= 0 && this.currentChoiceMoment) {
      const choice = this.currentChoiceMoment.choices[this.pendingChoiceIndex];
      if (choice.segmentId) nextSegment = choice.segmentId;
      else if (choice.sg) nextSegment = this._resolveSegmentGroup(choice.sg);
      this.pendingChoiceIndex = -1;
      this._applyImpression(choice.impressionData);
    }

    if (!nextSegment && fromSegmentId && this.segmentGroups[fromSegmentId]) {
      nextSegment = this._resolveSegmentGroup(fromSegmentId);
    }
    if (!nextSegment && fromSegmentId) {
      const seg = this.segments[fromSegmentId];
      nextSegment = seg && seg.defaultNext;
    }

    if (!nextSegment) {
      const seg = this.segments[fromSegmentId];
      if (seg && seg.credits) this.cb.onCredits && this.cb.onCredits(fromSegmentId);
      else this.cb.onFinished && this.cb.onFinished();
      return false;
    }

    return this._playSegment(nextSegment);
  }

  /** Seek to a segment's start, unless we're already naturally there. */
  _notifySegmentChange(id, node) {
    this.cb.onSegmentChange && this.cb.onSegmentChange(id, node);
    if (node && node.credits) this.cb.onCredits && this.cb.onCredits(id);
  }

  _playSegment(segmentId) {
    const seg = this.segments[segmentId];
    if (!seg) { this.cb.onFinished && this.cb.onFinished(); return false; }
    const currentlyAt = this._segmentIdAt(Math.round(this.video.currentTime * 1000));
    if (currentlyAt === segmentId) return false; // already there, no seek needed

    // Teleport bookkeeping now, synchronously — the real seek finishes
    // asynchronously, but by the time the next timeupdate tick arrives
    // it must already look like "we're in segmentId", or the crossing
    // detector would try to resolve this same jump a second time.
    this.prevSegmentId = this.currentSegmentId;
    this.currentSegmentId = segmentId;
    this.lastMoments = {};
    this._notifySegmentChange(segmentId, seg);

    this.cb.onCut && this.cb.onCut();
    this._seekTo(seg.startTimeMs / 1000);
    return true;
  }

  /** Manual scrub/skip from the UI. Re-syncs branching state to the new position. */
  seekToTime(ms) {
    if (this.currentChoiceMoment) {
      this.pendingChoiceIndex = -1;
      this.currentChoiceMoment = null;
      this.cb.onChoiceClear && this.cb.onChoiceClear();
    }
    const id = this._segmentIdAt(ms);
    this._seekTo(ms / 1000).then(() => {
      this.currentSegmentId = id;
      this.lastMoments = {};
      this.lastMs = ms;
      this.cb.onSegmentChange && this.cb.onSegmentChange(id, this.segments[id]);
    });
  }

  /** Pause, seek, wait for the real `seeked` event, then resume — avoids the classic freeze-but-audio-continues artifact. */
  _seekTo(targetSeconds) {
    if (Math.abs(this.video.currentTime - targetSeconds) < 0.1) {
      if (this.video.paused) this.video.play().catch(() => {});
      return Promise.resolve();
    }
    this.seeking = true;
    this.forceSeeked = true;
    const wasPlaying = !this.video.paused;
    return new Promise((resolve) => {
      const done = () => {
        this.video.removeEventListener('seeked', done);
        this.seeking = false;
        if (wasPlaying) this.video.play().catch(() => {});
        resolve();
      };
      this.video.addEventListener('seeked', done); // registered BEFORE triggering the seek below
      this.video.pause();
      this.video.currentTime = targetSeconds;
      setTimeout(done, 1500); // safety net if `seeked` never fires
    });
  }
}

/* ============================================================
 *  Stopwatch & Countdown — vanilla JS SPA
 *  Public, neutral title (no third-party brand).
 *  Exposes pure helpers and state classes on `window.App`
 *  so tests.html can import and unit-test them.
 * ============================================================ */

(function () {
  'use strict';

  /** Configurable header label. Empty string renders an empty bar. */
  const APP_TITLE = 'Stopwatch & Countdown';

  /* =====================================================
   *  Pure helpers (testable without DOM)
   * ===================================================== */

  /** Pad an integer to 2 digits with leading zeros. */
  function pad2(n) { return String(Math.max(0, n | 0)).padStart(2, '0'); }
  /** Pad an integer to 3 digits with leading zeros. */
  function pad3(n) { return String(Math.max(0, n | 0)).padStart(3, '0'); }

  /**
   * Format a non-negative ms duration into the parts displayed by the timer.
   * The hours field is clamped to 99 so the display never overflows the mask.
   * @param {number} ms
   * @returns {{display:string, milliText:string, hours:number, minutes:number, seconds:number, millis:number}}
   */
  function formatTime(ms) {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const totalMs = Math.floor(ms);
    let hh = Math.floor(totalMs / 3_600_000);
    const mm = Math.floor((totalMs % 3_600_000) / 60_000);
    const ss = Math.floor((totalMs % 60_000) / 1_000);
    const milli = totalMs % 1_000;
    if (hh > 99) hh = 99;
    return {
      display: `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`,
      milliText: pad3(milli),
      hours: hh, minutes: mm, seconds: ss, millis: milli,
    };
  }

  /**
   * Microwave-style keypad shift: append a digit on the right and keep at most
   * the last 6 characters. No live validation; values >59 are normalised on Set.
   * @param {string} buffer
   * @param {string} digit  single character "0".."9"
   * @returns {string}
   */
  function keypadShiftIn(buffer, digit) {
    if (typeof digit !== 'string' || digit.length !== 1 || !/[0-9]/.test(digit)) {
      throw new Error('keypadShiftIn: digit must be a single 0-9 character');
    }
    return ((buffer || '') + digit).slice(-6);
  }

  /** Drop the rightmost digit of the keypad buffer. */
  function keypadBackspace(buffer) {
    return (buffer || '').slice(0, -1);
  }

  /**
   * Convert keypad buffer to ms with normalisation:
   *   "1234" -> 00:12:34 -> 754_000
   *   "9999" -> 99:99 (treated as 99m99s) -> (99*60+99)*1000 = 5_999_000
   * Note: minutes / seconds may exceed 59 in the buffer — they are accumulated
   * into hours/minutes when starting the countdown.
   * @param {string} buffer
   */
  function bufferToMs(buffer) {
    const padded = (buffer || '').padStart(6, '0');
    if (!/^\d{6}$/.test(padded)) return 0;
    const hh = parseInt(padded.slice(0, 2), 10);
    const mm = parseInt(padded.slice(2, 4), 10);
    const ss = parseInt(padded.slice(4, 6), 10);
    return ((hh * 3600) + (mm * 60) + ss) * 1000;
  }

  /**
   * Convert ms to a 0..6 char keypad buffer (no leading zeros).
   * Used after a direct edit to keep the keypad buffer consistent with the
   * value the user typed in the input.
   */
  function msToBuffer(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '';
    const f = formatTime(ms);
    const six = pad2(f.hours) + pad2(f.minutes) + pad2(f.seconds);
    return six.replace(/^0+/, '');
  }

  /**
   * Validate a partial value typed in the direct-edit input. Allows the user
   * to be mid-typing (trailing colon, empty parts), but rejects anything that
   * could not become a valid HH:MM:SS:
   *   - only [0-9] and ':' characters
   *   - at most 2 colons (so up to 3 groups)
   *   - each group at most 2 digits
   * @param {string} v
   * @returns {boolean}
   */
  function isValidPartialMask(v) {
    if (typeof v !== 'string') return false;
    if (!/^[0-9:]*$/.test(v)) return false;
    const parts = v.split(':');
    if (parts.length > 3) return false;
    for (const p of parts) {
      if (p.length > 2) return false;
    }
    return true;
  }

  /**
   * Parse a free-form display string typed in edit mode. Accepts:
   *   "30"          -> 30 seconds
   *   "1:30"        -> 1m30s
   *   "1:30:00"     -> 1h30m
   *   "01:30:00"    -> idem
   *   ""            -> 0
   * Rejects: non-digit/non-colon characters, more than 3 parts,
   *          parts longer than 2 digits, parts > 99.
   * Each part is allowed up to 99 (so 99:99:99 normalises to 100h38m39s).
   * @param {string} str
   * @returns {number|null}  ms, or null if invalid
   */
  function parseDisplayString(str) {
    if (typeof str !== 'string') return null;
    const trimmed = str.trim();
    if (trimmed === '') return 0;
    if (!/^[0-9:]*$/.test(trimmed)) return null;

    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      if (parts.length === 0 || parts.length > 3) return null;
      const nums = [];
      for (const p of parts) {
        if (p === '') { nums.push(0); continue; }
        if (!/^\d{1,2}$/.test(p)) return null;
        nums.push(parseInt(p, 10));
      }
      let hh = 0, mm = 0, ss = 0;
      if (nums.length === 1) ss = nums[0];
      else if (nums.length === 2) [mm, ss] = nums;
      else [hh, mm, ss] = nums;
      return ((hh * 3600) + (mm * 60) + ss) * 1000;
    }

    if (trimmed.length > 6) return null;
    return bufferToMs(trimmed);
  }

  /* =====================================================
   *  State machines
   * ===================================================== */

  /** State: idle -> running -> paused -> idle (Clear). */
  class StopwatchState {
    constructor(now = () => performance.now()) {
      this._now = now;
      this._startedAt = null;
      this._accum = 0;
      this._running = false;
    }
    start() {
      if (this._running) return;
      this._startedAt = this._now();
      this._running = true;
    }
    pause() {
      if (!this._running) return;
      this._accum += this._now() - this._startedAt;
      this._startedAt = null;
      this._running = false;
    }
    clear() {
      this._startedAt = null;
      this._accum = 0;
      this._running = false;
    }
    getCurrentMs() {
      return this._running ? this._accum + (this._now() - this._startedAt) : this._accum;
    }
    getStateLabel() {
      if (this._running) return 'running';
      if (this._accum > 0) return 'paused';
      return 'idle';
    }
  }

  /** Countdown: setTotal -> start -> pause/continue -> reaches 0 (or clear). */
  class CountdownState {
    constructor(now = () => performance.now()) {
      this._now = now;
      this._totalMs = 0;
      this._remaining = 0;
      this._startedAt = null;
      this._running = false;
    }
    setTotal(ms) {
      if (!Number.isFinite(ms) || ms < 0) ms = 0;
      this._totalMs = ms;
      this._remaining = ms;
      this._startedAt = null;
      this._running = false;
    }
    start() {
      if (this._running) return;
      if (this._remaining <= 0) return;
      this._startedAt = this._now();
      this._running = true;
    }
    pause() {
      if (!this._running) return;
      const elapsed = this._now() - this._startedAt;
      this._remaining = Math.max(0, this._remaining - elapsed);
      this._startedAt = null;
      this._running = false;
    }
    clear() {
      this._totalMs = 0;
      this._remaining = 0;
      this._startedAt = null;
      this._running = false;
    }
    getCurrentMs() {
      if (!this._running) return this._remaining;
      const r = this._remaining - (this._now() - this._startedAt);
      return r > 0 ? r : 0;
    }
    isFinished() {
      return this._totalMs > 0 && this.getCurrentMs() <= 0;
    }
    getStateLabel() {
      if (this._running) return 'running';
      if (this._totalMs > 0 && this._remaining > 0 && this._remaining < this._totalMs) return 'paused';
      return 'idle';
    }
  }

  /* =====================================================
   *  Audio — synthesized beep (no external assets)
   * ===================================================== */

  let audioCtx = null;
  /** Lazily create / resume AudioContext. Must be called from a user gesture. */
  function ensureAudio() {
    try {
      if (!audioCtx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        audioCtx = new Ctor();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (_e) { return null; }
  }
  /** Emit `times` short tones in sequence. */
  function playBeep(times = 5) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const tone = 880;
    const dur = 0.18;
    const gap = 0.22;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = tone;
      osc.connect(gain).connect(ctx.destination);
      const t0 = ctx.currentTime + i * (dur + gap);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }
  }

  /* =====================================================
   *  Expose for tests
   * ===================================================== */
  const App = {
    APP_TITLE,
    pad2, pad3, formatTime,
    keypadShiftIn, keypadBackspace, bufferToMs, msToBuffer,
    parseDisplayString, isValidPartialMask,
    StopwatchState, CountdownState,
  };
  window.App = App;

  /* =====================================================
   *  DOM bootstrap (skipped in test runner with ?notest)
   * ===================================================== */
  if (typeof document === 'undefined') return;

  document.addEventListener('DOMContentLoaded', initUI);

  function initUI() {
    // Header text
    const titleEl = document.getElementById('appTitle');
    if (titleEl) titleEl.textContent = APP_TITLE;

    const views = {
      selector:  document.getElementById('view-selector'),
      stopwatch: document.getElementById('view-stopwatch'),
      countdown: document.getElementById('view-countdown'),
    };
    const backBtn = document.getElementById('back-btn');

    /* ---------- View routing ---------- */
    let currentView = 'selector';
    function showView(name) {
      currentView = name;
      Object.entries(views).forEach(([k, el]) => {
        if (!el) return;
        el.hidden = (k !== name);
      });
      backBtn.hidden = (name === 'selector');
      // When leaving a timer, stop and reset that timer
      if (name !== 'stopwatch') resetStopwatch();
      if (name !== 'countdown') resetCountdown();
      // Move focus for accessibility
      if (name === 'selector') {
        views.selector.querySelector('.card-stopwatch')?.focus();
      } else if (name === 'stopwatch') {
        document.getElementById('sw-start')?.focus();
      } else if (name === 'countdown') {
        document.getElementById('cd-set')?.focus();
      }
    }

    document.querySelectorAll('[data-target]').forEach((el) => {
      el.addEventListener('click', () => showView(el.dataset.target));
    });
    backBtn.addEventListener('click', () => showView('selector'));

    /* ---------- Stopwatch wiring ---------- */
    const sw = new StopwatchState();
    const swText = document.getElementById('sw-text');
    const swMs   = document.getElementById('sw-ms');
    const swStart = document.getElementById('sw-start');
    const swClear = document.getElementById('sw-clear');
    let swRaf = null;

    function renderStopwatch() {
      const f = formatTime(sw.getCurrentMs());
      swText.textContent = f.display;
      swMs.textContent = f.milliText;
      const label = sw.getStateLabel();
      if (label === 'running') {
        swStart.textContent = 'Pause';
        swStart.classList.remove('btn-green');
        swStart.classList.add('btn-amber');
      } else if (label === 'paused') {
        swStart.textContent = 'Continue';
        swStart.classList.remove('btn-green');
        swStart.classList.add('btn-amber');
      } else {
        swStart.textContent = 'Start';
        swStart.classList.add('btn-green');
        swStart.classList.remove('btn-amber');
      }
      swClear.disabled = (label === 'idle');
    }
    function tickStopwatch() {
      renderStopwatch();
      if (sw.getStateLabel() === 'running') {
        swRaf = requestAnimationFrame(tickStopwatch);
      }
    }
    function resetStopwatch() {
      if (swRaf) cancelAnimationFrame(swRaf);
      swRaf = null;
      sw.clear();
      renderStopwatch();
    }

    swStart.addEventListener('click', () => {
      ensureAudio(); // user gesture: prepare audio for any later beep
      const label = sw.getStateLabel();
      if (label === 'running') sw.pause();
      else sw.start();
      renderStopwatch();
      if (sw.getStateLabel() === 'running') tickStopwatch();
    });
    swClear.addEventListener('click', () => {
      sw.clear();
      renderStopwatch();
    });
    renderStopwatch();

    /* ---------- Countdown wiring ---------- */
    const cd = new CountdownState();
    const cdDisplay = document.getElementById('cd-display');
    const cdText = document.getElementById('cd-text');
    const cdInput = document.getElementById('cd-input');
    const cdMs = document.getElementById('cd-ms');
    const cdKeypad = document.getElementById('cd-keypad');
    const cdRunningControls = document.getElementById('cd-running-controls');
    const cdSetBtn = document.getElementById('cd-set');
    const cdClearBtn = document.getElementById('cd-clear');
    const cdPauseBtn = document.getElementById('cd-pause');
    const cdStopBtn = document.getElementById('cd-stop');
    const cdError = document.getElementById('cd-error');
    let cdBuffer = '';        // keypad buffer
    let cdRaf = null;
    let cdEditing = false;
    let cdLastValidInput = ''; // for live mask validation in edit mode

    function showCdError(msg) {
      if (msg) cdError.textContent = msg;
      cdError.hidden = false;
      cdDisplay.classList.add('error');
      // Replay shake animation
      cdDisplay.classList.remove('shake');
      void cdDisplay.offsetWidth;
      cdDisplay.classList.add('shake');
    }
    function clearCdError() {
      cdError.hidden = true;
      cdDisplay.classList.remove('error', 'shake');
    }

    function syncKeypadVisibility() {
      const label = cd.getStateLabel();
      // Show keypad while idle. When running/paused show the big Pause/Clear row.
      const showKeypad = label === 'idle';
      cdKeypad.hidden = !showKeypad;
      cdRunningControls.hidden = showKeypad;

      if (label === 'running') {
        cdPauseBtn.textContent = 'Pause';
        cdPauseBtn.classList.remove('btn-green');
        cdPauseBtn.classList.add('btn-amber');
      } else if (label === 'paused') {
        cdPauseBtn.textContent = 'Continue';
        cdPauseBtn.classList.remove('btn-green');
        cdPauseBtn.classList.add('btn-amber');
      }
      // Editing only allowed while idle
      cdDisplay.classList.toggle('editable', label === 'idle');
      if (label !== 'idle' && cdEditing) exitEditMode(false);
    }

    function renderCountdown() {
      const ms = cd.getCurrentMs();
      const f = formatTime(ms);
      // While idle, display reflects the keypad buffer
      if (cd.getStateLabel() === 'idle') {
        if (!cdEditing) {
          const padded = cdBuffer.padStart(6, '0');
          cdText.textContent = `${padded.slice(0,2)}:${padded.slice(2,4)}:${padded.slice(4,6)}`;
          cdMs.textContent = '000';
        }
      } else {
        cdText.textContent = f.display;
        cdMs.textContent = f.milliText;
      }
      cdSetBtn.textContent = 'Set';
    }

    function tickCountdown() {
      renderCountdown();
      if (cd.isFinished()) {
        cd.pause();
        cdText.textContent = '00:00:00';
        cdMs.textContent = '000';
        flashAndBeep();
        cd.clear();
        cdBuffer = '';
        syncKeypadVisibility();
        renderCountdown();
        return;
      }
      if (cd.getStateLabel() === 'running') {
        cdRaf = requestAnimationFrame(tickCountdown);
      }
    }

    function flashAndBeep() {
      cdDisplay.classList.remove('blinking');
      // force reflow so the animation can replay
      void cdDisplay.offsetWidth;
      cdDisplay.classList.add('blinking');
      cdDisplay.addEventListener('animationend', function onEnd() {
        cdDisplay.classList.remove('blinking');
        cdDisplay.removeEventListener('animationend', onEnd);
      });
      playBeep(5);
    }

    function resetCountdown() {
      if (cdRaf) cancelAnimationFrame(cdRaf);
      cdRaf = null;
      cd.clear();
      cdBuffer = '';
      cdDisplay.classList.remove('blinking');
      exitEditMode(false);
      syncKeypadVisibility();
      renderCountdown();
    }

    /* Direct edit mode: replace display-text by an input. */
    function enterEditMode() {
      if (cd.getStateLabel() !== 'idle') return;
      cdEditing = true;
      cdInput.value = cdText.textContent.trim();
      cdLastValidInput = cdInput.value;
      cdText.hidden = true;
      cdInput.hidden = false;
      cdDisplay.classList.add('editing');
      clearCdError();
      // Defer focus to allow layout
      requestAnimationFrame(() => {
        cdInput.focus();
        cdInput.select();
      });
    }
    function exitEditMode(commit) {
      if (!cdEditing) return;
      if (commit) {
        const ms = parseDisplayString(cdInput.value);
        if (ms === null) {
          // Reject and stay in edit mode with a visible error
          showCdError('Invalid time. Use HH:MM:SS (digits and colons only, max 2 digits per group).');
          cdInput.focus();
          cdInput.select();
          return;
        }
        cdBuffer = msToBuffer(ms);
      }
      cdEditing = false;
      cdInput.hidden = true;
      cdText.hidden = false;
      cdDisplay.classList.remove('editing');
      clearCdError();
      renderCountdown();
      cdDisplay.focus();
    }

    cdDisplay.addEventListener('click', (e) => {
      // Ignore clicks on the inner input (re-entry)
      if (e.target === cdInput) return;
      if (cd.getStateLabel() !== 'idle') return;
      if (!cdEditing) enterEditMode();
    });
    cdDisplay.addEventListener('keydown', (e) => {
      if (cd.getStateLabel() !== 'idle') return;
      if (cdEditing) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        enterEditMode();
      }
    });
    cdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        exitEditMode(true);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        exitEditMode(false);
        return;
      }
      // Block printable chars that aren't digits / colon (allow shortcuts)
      if (e.key.length === 1 && !/^[0-9:]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
      }
    });
    // Live mask validation: revert typing/paste that would break HH:MM:SS.
    cdInput.addEventListener('input', () => {
      if (isValidPartialMask(cdInput.value)) {
        cdLastValidInput = cdInput.value;
        clearCdError();
      } else {
        cdInput.value = cdLastValidInput;
      }
    });
    cdInput.addEventListener('blur', () => exitEditMode(true));

    /* Keypad clicks */
    cdKeypad.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      ensureAudio();
      if (btn.dataset.digit !== undefined) {
        cdBuffer = keypadShiftIn(cdBuffer, btn.dataset.digit);
        renderCountdown();
      } else if (btn.id === 'cd-clear') {
        cdBuffer = '';
        renderCountdown();
      } else if (btn.id === 'cd-set') {
        startCountdownFromBuffer();
      }
    });

    function startCountdownFromBuffer() {
      const ms = bufferToMs(cdBuffer);
      if (ms <= 0) return; // nothing to start
      cd.setTotal(ms);
      cd.start();
      syncKeypadVisibility();
      tickCountdown();
    }

    cdPauseBtn.addEventListener('click', () => {
      ensureAudio();
      const label = cd.getStateLabel();
      if (label === 'running') {
        cd.pause();
      } else if (label === 'paused') {
        cd.start();
      }
      syncKeypadVisibility();
      renderCountdown();
      if (cd.getStateLabel() === 'running') tickCountdown();
    });
    cdStopBtn.addEventListener('click', () => {
      resetCountdown();
    });

    /* Hardware keyboard shortcuts in countdown view */
    document.addEventListener('keydown', (e) => {
      if (currentView !== 'countdown') return;
      // While editing, let the input handle keys natively
      if (cdEditing) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const label = cd.getStateLabel();
      if (label === 'idle') {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          cdBuffer = keypadShiftIn(cdBuffer, e.key);
          renderCountdown();
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          cdBuffer = keypadBackspace(cdBuffer);
          renderCountdown();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          startCountdownFromBuffer();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          if (cdBuffer.length > 0) { cdBuffer = ''; renderCountdown(); }
          else showView('selector');
          return;
        }
      } else {
        if (e.key === 'Enter') {
          e.preventDefault();
          cdPauseBtn.click();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          resetCountdown();
          return;
        }
      }
    });

    /* Hardware keyboard shortcuts in stopwatch view */
    document.addEventListener('keydown', (e) => {
      if (currentView !== 'stopwatch') return;
      if (e.key === 'Enter' || e.key === ' ') {
        // Let the focused button's default fire if it's already a button.
        if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
        e.preventDefault();
        swStart.click();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (sw.getStateLabel() !== 'idle') swClear.click();
        else showView('selector');
      }
    });

    /* Initial state */
    showView('selector');
    syncKeypadVisibility();
    renderCountdown();
  }
})();

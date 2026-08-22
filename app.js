(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const engine = new window.FrequencyGeneratorEngine({ requestedSampleRate: 96000 });

  const WAVEFORMS = ['sine', 'triangle', 'square', 'sawtooth'];
  const waveformNames = {
    sine: 'SINUSOÏDE', triangle: 'TRIANGLE', square: 'CARRÉE', sawtooth: 'DENT DE SCIE'
  };
  const waveformColors = {
    sine: { h: 182, s: 100, l: 50 },
    triangle: { h: 93, s: 100, l: 50 },
    square: { h: 310, s: 100, l: 58 },
    sawtooth: { h: 37, s: 100, l: 50 }
  };

  const state = {
    baseFrequency: 440,
    cents: 0,
    waveformMorph: 0,
    waveformMix: { sine: 1, triangle: 0, square: 0, sawtooth: 0 },
    masterVolume: 0.25,
    autoNormalize: true,
    fundamentalEnabled: true,
    overRichness: 0,
    subRichness: 0,
    partials: []
  };

  const frequencyDial = $('frequencyDial');
  const waveformDial = $('waveformDial');
  const frequencyInput = $('frequencyInput');
  const frequencyReadout = $('frequencyReadout');
  const frequencyTrackBg = $('frequencyTrackBg');
  const frequencyTrackActive = $('frequencyTrackActive');
  const frequencyMarkerDot = $('frequencyMarkerDot');
  const scopeCanvas = $('oscilloscope');
  const scopeCtx = scopeCanvas.getContext('2d');
  const waveCanvas = $('wavePreview');
  const waveCtx = waveCanvas.getContext('2d');

  let scopeFrame = null;
  let wavePreviewFrame = null;
  let frequencyDrag = null;
  let waveformDrag = null;
  let manualHoldState = null;
  const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_MOVE_PX = 12;
  const TOUCH_CENTS_PER_DEGREE = 3.25;

  if (coarsePointer) {
    frequencyInput.readOnly = true;
    frequencyInput.setAttribute('aria-readonly', 'true');
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function centsFactor(cents = state.cents) { return Math.pow(2, cents / 1200); }
  function effectiveFrequency() { return clamp(state.baseFrequency * centsFactor(), 0, 25000); }
  function formatHz(value) { return value >= 1000 ? value.toFixed(2) : value.toFixed(3); }

  function nearestNote(freq) {
    if (!Number.isFinite(freq) || freq <= 0) return { name: 'DC', cents: 0 };
    const midi = 69 + 12 * Math.log2(freq / 440);
    const nearest = Math.round(midi);
    const cents = Math.round((midi - nearest) * 100);
    const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    return { name: `${names[((nearest % 12) + 12) % 12]}${Math.floor(nearest / 12) - 1}`, cents };
  }

  // Source unique de vérité du cadran de fréquence.
  // Les mêmes points servent à placer les libellés, le curseur, la zone colorée
  // et à convertir une position de pointeur en fréquence.
  // 0–10 Hz est linéaire (un logarithme est impossible à 0), puis chaque
  // intervalle positif est interpolé logarithmiquement.
  const FREQUENCY_STOPS = [
    { frequency: 0, angle: -135 },
    { frequency: 10, angle: -115 },
    { frequency: 20, angle: -98 },
    { frequency: 100, angle: -72 },
    { frequency: 440, angle: -45 },
    { frequency: 1000, angle: -22 },
    { frequency: 5000, angle: 18 },
    { frequency: 10000, angle: 48 },
    { frequency: 20000, angle: 82 },
    { frequency: 25000, angle: 135 }
  ];
  const FREQUENCY_DIAL_START = FREQUENCY_STOPS[0].angle;
  const FREQUENCY_DIAL_END = FREQUENCY_STOPS[FREQUENCY_STOPS.length - 1].angle;

  function segmentRatioFromFrequency(f, a, b) {
    if (a.frequency <= 0) return clamp((f - a.frequency) / (b.frequency - a.frequency), 0, 1);
    return clamp(Math.log(f / a.frequency) / Math.log(b.frequency / a.frequency), 0, 1);
  }

  function frequencyFromSegmentRatio(t, a, b) {
    const ratio = clamp(t, 0, 1);
    if (a.frequency <= 0) return a.frequency + (b.frequency - a.frequency) * ratio;
    return a.frequency * Math.pow(b.frequency / a.frequency, ratio);
  }

  function frequencyToAngle(freq) {
    const f = clamp(Number(freq) || 0, 0, 25000);
    if (f <= FREQUENCY_STOPS[0].frequency) return FREQUENCY_DIAL_START;
    if (f >= FREQUENCY_STOPS[FREQUENCY_STOPS.length - 1].frequency) return FREQUENCY_DIAL_END;

    for (let i = 0; i < FREQUENCY_STOPS.length - 1; i += 1) {
      const a = FREQUENCY_STOPS[i];
      const b = FREQUENCY_STOPS[i + 1];
      if (f >= a.frequency && f <= b.frequency) {
        const t = segmentRatioFromFrequency(f, a, b);
        return a.angle + (b.angle - a.angle) * t;
      }
    }
    return FREQUENCY_DIAL_START;
  }

  function angleToFrequency(angle) {
    const aValue = clamp(Number(angle) || 0, FREQUENCY_DIAL_START, FREQUENCY_DIAL_END);
    if (aValue <= FREQUENCY_DIAL_START) return 0;
    if (aValue >= FREQUENCY_DIAL_END) return 25000;

    for (let i = 0; i < FREQUENCY_STOPS.length - 1; i += 1) {
      const a = FREQUENCY_STOPS[i];
      const b = FREQUENCY_STOPS[i + 1];
      if (aValue >= a.angle && aValue <= b.angle) {
        const t = (aValue - a.angle) / (b.angle - a.angle);
        return frequencyFromSegmentRatio(t, a, b);
      }
    }
    return 0;
  }

  const FREQUENCY_ARC_RADIUS = 216;
  const FREQUENCY_ARC_CENTER = 250;
  function frequencyArcPoint(angle, radius = FREQUENCY_ARC_RADIUS) {
    const radians = angle * Math.PI / 180;
    return {
      x: FREQUENCY_ARC_CENTER + Math.sin(radians) * radius,
      y: FREQUENCY_ARC_CENTER - Math.cos(radians) * radius
    };
  }
  function frequencyArcPath(startAngle, endAngle, radius = FREQUENCY_ARC_RADIUS) {
    const start = frequencyArcPoint(startAngle, radius);
    const end = frequencyArcPoint(endAngle, radius);
    const sweep = Math.max(0, endAngle - startAngle);
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
  }
  function positionFrequencyMarks() {
    document.querySelectorAll('.freq-mark[data-frequency]').forEach((button) => {
      const frequency = Number(button.dataset.frequency);
      const stop = FREQUENCY_STOPS.find((item) => item.frequency === frequency);
      if (!stop) return;
      const point = frequencyArcPoint(stop.angle);
      button.style.left = `${(point.x / 5).toFixed(3)}%`;
      button.style.top = `${(point.y / 5).toFixed(3)}%`;
    });
    frequencyTrackBg.setAttribute('d', frequencyArcPath(FREQUENCY_DIAL_START, FREQUENCY_DIAL_END));
  }

  function shortestHueMix(a, b, t) {
    const delta = ((b - a + 540) % 360) - 180;
    return (a + delta * t + 360) % 360;
  }

  function hslString(color, alpha = 1) {
    return `hsla(${color.h.toFixed(1)}, ${color.s}%, ${color.l}%, ${alpha})`;
  }

  function mixedWaveColor(aWave, bWave, t) {
    const a = waveformColors[aWave];
    const b = waveformColors[bWave];
    return { h: shortestHueMix(a.h, b.h, t), s: a.s + (b.s - a.s) * t, l: a.l + (b.l - a.l) * t };
  }

  function morphMix(position) {
    const wrapped = ((position % 4) + 4) % 4;
    const index = Math.floor(wrapped);
    const next = (index + 1) % 4;
    const t = wrapped - index;
    const mix = { sine: 0, triangle: 0, square: 0, sawtooth: 0 };
    mix[WAVEFORMS[index]] = 1 - t;
    mix[WAVEFORMS[next]] = t;
    return { mix, index, next, t, wrapped };
  }

  function buildPartials() {
    const partials = [];
    if (state.fundamentalEnabled) partials.push({ id: 'fundamental', ratio: 1, level: 1, enabled: true });

    const over = state.overRichness / 100;
    const overCount = over === 0 ? 0 : Math.max(1, Math.ceil(over * 9));
    for (let i = 0; i < overCount; i += 1) {
      const n = i + 2;
      const activation = clamp((over - i / 9) * 9, 0, 1);
      const level = activation * over * (0.34 / Math.pow(n - 1, 0.68));
      partials.push({ id: `over-${n}`, ratio: n, level, enabled: level > 0.0005, waveform: 'sine' });
    }

    const sub = state.subRichness / 100;
    const subCount = sub === 0 ? 0 : Math.max(1, Math.ceil(sub * 5));
    for (let i = 0; i < subCount; i += 1) {
      const n = i + 2;
      const activation = clamp((sub - i / 5) * 5, 0, 1);
      const level = activation * sub * (0.22 / Math.pow(n - 1, 0.55));
      partials.push({ id: `sub-${n}`, ratio: 1 / n, level, enabled: level > 0.0005, waveform: 'sine' });
    }

    state.partials = partials;
    $('overCount').textContent = String(partials.filter(p => p.id.startsWith('over-') && p.enabled).length);
    $('subCount').textContent = String(partials.filter(p => p.id.startsWith('sub-') && p.enabled).length);
  }

  function syncEngine() {
    buildPartials();
    engine.setState({
      baseFrequency: state.baseFrequency,
      cents: state.cents,
      masterVolume: state.masterVolume,
      autoNormalize: state.autoNormalize,
      partials: state.partials,
      waveformMix: state.waveformMix
    });
  }

  function updateFineUI() {
    const cents = state.cents;
    $('centsSlider').value = String(cents);
    $('centsOutput').textContent = `${cents > 0 ? '+' : ''}${cents} cent${Math.abs(cents) === 1 ? '' : 's'}`;
  }

  function updateFrequencyUI() {
    const actual = effectiveFrequency();
    const angle = frequencyToAngle(actual);
    frequencyTrackActive.setAttribute('d', frequencyArcPath(FREQUENCY_DIAL_START, angle));
    const markerPoint = frequencyArcPoint(angle);
    frequencyMarkerDot.setAttribute('cx', markerPoint.x.toFixed(3));
    frequencyMarkerDot.setAttribute('cy', markerPoint.y.toFixed(3));
    frequencyDial.setAttribute('aria-valuenow', actual.toFixed(3));
    if (document.activeElement !== frequencyInput) frequencyInput.value = String(Number(actual.toFixed(3)));
    $('effectiveFrequency').textContent = formatHz(actual);
    const note = nearestNote(actual);
    $('noteHint').textContent = `${note.name} • ${note.cents > 0 ? '+' : ''}${note.cents} cent${Math.abs(note.cents) === 1 ? '' : 's'}`;
  }

  function updateDiagnostics() {
    const sampleRate = engine.getSampleRate();
    const nyquist = engine.getNyquist();
    $('sampleRateStatus').textContent = sampleRate ? `Sample rate : ${sampleRate.toLocaleString('fr-FR')} Hz` : 'Sample rate : —';
    $('sampleRateValue').textContent = sampleRate ? `${sampleRate.toLocaleString('fr-FR')} Hz` : '—';
    $('nyquistValue').textContent = nyquist ? `${nyquist.toLocaleString('fr-FR')} Hz` : '—';
    const warning = $('nyquistWarning');
    if (nyquist && effectiveFrequency() >= nyquist) {
      warning.textContent = `La fréquence demandée atteint/dépasse Nyquist (${nyquist.toLocaleString('fr-FR')} Hz) : elle ne peut pas être reproduite correctement par cette sortie.`;
      warning.classList.add('warning');
    } else {
      warning.textContent = 'Le module demande 96 kHz ; les composantes au-delà de Nyquist sont automatiquement coupées.';
      warning.classList.remove('warning');
    }
  }

  function commitFrequency(value, resetFine = true) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const target = clamp(n, 0, 25000);
    if (resetFine) {
      state.cents = 0;
      updateFineUI();
      state.baseFrequency = target;
    } else {
      state.baseFrequency = clamp(target / centsFactor(), 0, 25000);
    }
    updateFrequencyUI();
    syncEngine();
    updateDiagnostics();
  }

  function updateWaveformUI() {
    const data = morphMix(state.waveformMorph);
    state.waveformMix = data.mix;
    const a = WAVEFORMS[data.index];
    const b = WAVEFORMS[data.next];
    const color = mixedWaveColor(a, b, data.t);

    waveformDial.style.setProperty('--wave-angle', `${data.wrapped * 90}deg`);
    waveformDial.style.setProperty('--wave-color', hslString(color));
    waveformDial.style.setProperty('--wave-color-a', hslString(waveformColors[a]));
    waveformDial.style.setProperty('--wave-color-b', hslString(waveformColors[b]));
    waveformDial.setAttribute('aria-valuenow', data.wrapped.toFixed(3));

    document.querySelectorAll('.wave-anchor').forEach((button) => {
      const exact = Math.abs(data.wrapped - Number(button.dataset.waveIndex)) < 0.008 || (Number(button.dataset.waveIndex) === 0 && data.wrapped > 3.992);
      button.classList.toggle('is-exact', exact);
    });

    const aPct = Math.round((1 - data.t) * 100);
    const bPct = 100 - aPct;
    let label;
    if (data.t < 0.005) label = `${waveformNames[a]} 100 %`;
    else if (data.t > 0.995) label = `${waveformNames[b]} 100 %`;
    else label = `${waveformNames[a]} ${aPct} % • ${waveformNames[b]} ${bPct} %`;
    $('waveformLabel').textContent = label;
    waveformDial.setAttribute('aria-valuetext', label);
    drawWavePreview(0);
  }

  function setWaveformMorph(value) {
    state.waveformMorph = ((Number(value) % 4) + 4) % 4;
    updateWaveformUI();
    syncEngine();
  }

  function waveformSample(type, phase) {
    const s = Math.sin(phase);
    if (type === 'sine') return s;
    if (type === 'triangle') return (2 / Math.PI) * Math.asin(s);
    if (type === 'square') return s >= 0 ? 1 : -1;
    const cycles = phase / (Math.PI * 2);
    return 2 * (cycles - Math.floor(cycles + 0.5));
  }

  function drawWavePreview(phaseOffset) {
    const w = waveCanvas.width;
    const h = waveCanvas.height;
    const mix = state.waveformMix;
    waveCtx.clearRect(0, 0, w, h);

    const grad = waveCtx.createLinearGradient(0, 0, w, 0);
    const data = morphMix(state.waveformMorph);
    const a = WAVEFORMS[data.index];
    const b = WAVEFORMS[data.next];
    const color = mixedWaveColor(a, b, data.t);
    grad.addColorStop(0, hslString(color, .28));
    grad.addColorStop(.5, hslString(color, 1));
    grad.addColorStop(1, hslString(color, .28));

    waveCtx.strokeStyle = grad;
    waveCtx.lineWidth = 8;
    waveCtx.lineCap = 'round';
    waveCtx.lineJoin = 'round';
    waveCtx.shadowColor = hslString(color, .9);
    waveCtx.shadowBlur = 24;
    waveCtx.beginPath();
    const cycles = 2.15;
    for (let x = 0; x <= w; x += 2) {
      const phase = phaseOffset + (x / w) * Math.PI * 2 * cycles;
      let yv = 0;
      WAVEFORMS.forEach((wave) => { yv += waveformSample(wave, phase) * (mix[wave] || 0); });
      const y = h / 2 - yv * h * .31;
      if (x === 0) waveCtx.moveTo(x, y); else waveCtx.lineTo(x, y);
    }
    waveCtx.stroke();
    waveCtx.shadowBlur = 0;
  }

  function animateWavePreview(time) {
    if (!engine.isPlaying) { wavePreviewFrame = null; return; }
    drawWavePreview((time || 0) * .0022);
    wavePreviewFrame = requestAnimationFrame(animateWavePreview);
  }

  function startWavePreview() {
    cancelAnimationFrame(wavePreviewFrame);
    wavePreviewFrame = requestAnimationFrame(animateWavePreview);
  }

  function stopWavePreview() {
    cancelAnimationFrame(wavePreviewFrame);
    wavePreviewFrame = null;
    drawWavePreview(0);
  }

  function drawScope() {
    const analyser = engine.getAnalyser();
    if (!engine.isPlaying || !analyser) return;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    const w = scopeCanvas.width;
    const h = scopeCanvas.height;
    scopeCtx.clearRect(0, 0, w, h);
    const grad = scopeCtx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(116,255,224,.28)');
    grad.addColorStop(.5, 'rgba(164,255,236,1)');
    grad.addColorStop(1, 'rgba(116,255,224,.28)');
    scopeCtx.strokeStyle = grad;
    scopeCtx.lineWidth = 4;
    scopeCtx.shadowColor = 'rgba(119,255,226,.78)';
    scopeCtx.shadowBlur = 15;
    scopeCtx.beginPath();
    const step = Math.max(1, Math.floor(data.length / 420));
    let x = 0;
    const xStep = w / Math.ceil(data.length / step);
    for (let i = 0; i < data.length; i += step) {
      const y = h / 2 + data[i] * h * .35;
      if (i === 0) scopeCtx.moveTo(x, y); else scopeCtx.lineTo(x, y);
      x += xStep;
    }
    scopeCtx.stroke();
    scopeCtx.shadowBlur = 0;
    scopeFrame = requestAnimationFrame(drawScope);
  }

  function startScope() {
    cancelAnimationFrame(scopeFrame);
    scopeFrame = requestAnimationFrame(drawScope);
  }

  function stopScope() {
    cancelAnimationFrame(scopeFrame);
    scopeFrame = null;
    scopeCtx.clearRect(0, 0, scopeCanvas.width, scopeCanvas.height);
  }

  function setPlayingUI(playing) {
    frequencyDial.classList.toggle('is-playing', playing);
    waveformDial.classList.toggle('is-playing', playing);
    $('toggleTone').classList.toggle('is-playing', playing);
    $('toggleTone').setAttribute('aria-pressed', String(playing));
    $('toggleTone').querySelector('.play-symbol').textContent = playing ? '■' : '▶';
    $('toneButtonLabel').textContent = playing ? 'PAUSE' : 'PLAY';
    $('frequencyModeLabel').textContent = playing ? 'OSCILLOSCOPE' : 'FRÉQUENCE';
    $('audioStatus').textContent = playing ? 'Audio actif' : 'Audio arrêté';
    $('audioStatus').classList.toggle('status-on', playing);
    $('audioStatus').classList.toggle('status-off', !playing);
    if (playing) { startScope(); startWavePreview(); } else { stopScope(); stopWavePreview(); }
  }

  function pointerAngle(event, element) {
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI;
  }

  function normalizedAngleDelta(current, previous) {
    let delta = current - previous;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  }

  function absoluteFrequencyFromPointer(event) {
    const rect = frequencyDial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let angle = Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI + 90;
    if (angle > 180) angle -= 360;
    angle = clamp(angle, FREQUENCY_DIAL_START, FREQUENCY_DIAL_END);
    return angleToFrequency(angle);
  }

  function waveformFromPointer(event) {
    const rect = waveformDial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let angle = Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI + 90;
    if (angle < 0) angle += 360;
    return angle / 90;
  }

  function beginManualFrequencyEntry() {
    frequencyInput.readOnly = false;
    frequencyInput.removeAttribute('aria-readonly');
    frequencyReadout.classList.add('is-editing');
    try { frequencyInput.focus({ preventScroll: true }); } catch (_) { frequencyInput.focus(); }
    try { frequencyInput.select(); } catch (_) {}
  }

  function finishManualFrequencyEntry() {
    commitFrequency(frequencyInput.value);
    frequencyReadout.classList.remove('is-editing', 'is-holding');
    if (coarsePointer) {
      frequencyInput.readOnly = true;
      frequencyInput.setAttribute('aria-readonly', 'true');
    }
  }

  /* Fréquence : uniquement ce cadran. Sur tactile, rotation relative. */
  frequencyDial.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.frequency-readout') || event.target.closest('.freq-mark')) return;
    event.preventDefault();
    frequencyDrag = {
      pointerId: event.pointerId,
      lastAngle: pointerAngle(event, frequencyDial),
      frequency: Math.max(effectiveFrequency(), 1),
      relative: event.pointerType === 'touch' || event.pointerType === 'pen' || coarsePointer
    };
    frequencyDial.setPointerCapture(event.pointerId);
    if (!frequencyDrag.relative) commitFrequency(absoluteFrequencyFromPointer(event));
  });

  frequencyDial.addEventListener('pointermove', (event) => {
    if (!frequencyDrag || frequencyDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (!frequencyDrag.relative) { commitFrequency(absoluteFrequencyFromPointer(event)); return; }
    const angle = pointerAngle(event, frequencyDial);
    const delta = normalizedAngleDelta(angle, frequencyDrag.lastAngle);
    frequencyDrag.lastAngle = angle;
    if (Math.abs(delta) < .04) return;
    const factor = Math.pow(2, (delta * TOUCH_CENTS_PER_DEGREE) / 1200);
    frequencyDrag.frequency = clamp(frequencyDrag.frequency * factor, 0, 25000);
    commitFrequency(frequencyDrag.frequency);
  });

  function endFrequencyDrag(event) {
    if (!frequencyDrag || frequencyDrag.pointerId !== event.pointerId) return;
    frequencyDrag = null;
    try { frequencyDial.releasePointerCapture(event.pointerId); } catch (_) {}
  }
  frequencyDial.addEventListener('pointerup', endFrequencyDrag);
  frequencyDial.addEventListener('pointercancel', () => { frequencyDrag = null; });

  frequencyDial.addEventListener('wheel', (event) => {
    event.preventDefault();
    const actual = effectiveFrequency();
    const step = event.shiftKey ? .1 : Math.max(1, actual * .002);
    commitFrequency(actual + (event.deltaY < 0 ? step : -step));
  }, { passive: false });

  frequencyDial.addEventListener('keydown', (event) => {
    const actual = effectiveFrequency();
    const step = event.shiftKey ? .1 : Math.max(1, actual * .002);
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') { event.preventDefault(); commitFrequency(actual + step); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') { event.preventDefault(); commitFrequency(actual - step); }
    else if (event.key === 'Home') { event.preventDefault(); commitFrequency(0); }
    else if (event.key === 'End') { event.preventDefault(); commitFrequency(25000); }
  });

  document.querySelectorAll('.freq-mark,[data-frequency].chip').forEach((button) => {
    button.addEventListener('click', (event) => { event.stopPropagation(); commitFrequency(Number(button.dataset.frequency)); });
  });

  /* Saisie mobile : pression longue de la valeur, sans modifier le cadran. */
  frequencyReadout.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    if (!coarsePointer && event.pointerType === 'mouse') return;
    if (!frequencyInput.readOnly) return;
    event.preventDefault();
    manualHoldState = { pointerId:event.pointerId, startedAt:performance.now(), x:event.clientX, y:event.clientY, cancelled:false };
    frequencyReadout.classList.add('is-holding');
    try { frequencyReadout.setPointerCapture(event.pointerId); } catch (_) {}
  });
  frequencyReadout.addEventListener('pointermove', (event) => {
    if (!manualHoldState || manualHoldState.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - manualHoldState.x, event.clientY - manualHoldState.y) > LONG_PRESS_MOVE_PX) {
      manualHoldState.cancelled = true;
      frequencyReadout.classList.remove('is-holding');
    }
  });
  frequencyReadout.addEventListener('pointerup', (event) => {
    if (!manualHoldState || manualHoldState.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const edit = !manualHoldState.cancelled && performance.now() - manualHoldState.startedAt >= LONG_PRESS_MS;
    manualHoldState = null;
    frequencyReadout.classList.remove('is-holding');
    try { frequencyReadout.releasePointerCapture(event.pointerId); } catch (_) {}
    if (edit) beginManualFrequencyEntry();
  });
  frequencyReadout.addEventListener('pointercancel', () => { manualHoldState = null; frequencyReadout.classList.remove('is-holding'); });
  frequencyReadout.addEventListener('contextmenu', (event) => { if (coarsePointer) event.preventDefault(); });
  frequencyInput.addEventListener('click', (event) => event.stopPropagation());
  frequencyInput.addEventListener('change', (event) => { if (!coarsePointer) commitFrequency(event.target.value); });
  frequencyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
    else if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.blur(); }
  });
  frequencyInput.addEventListener('blur', () => { if (coarsePointer && !frequencyInput.readOnly) finishManualFrequencyEntry(); });

  /* Forme d'onde : uniquement le second cadran. */
  waveformDial.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.wave-anchor')) return;
    event.preventDefault();
    waveformDrag = { pointerId:event.pointerId };
    waveformDial.setPointerCapture(event.pointerId);
    setWaveformMorph(waveformFromPointer(event));
  });
  waveformDial.addEventListener('pointermove', (event) => {
    if (!waveformDrag || waveformDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setWaveformMorph(waveformFromPointer(event));
  });
  waveformDial.addEventListener('pointerup', (event) => {
    if (!waveformDrag || waveformDrag.pointerId !== event.pointerId) return;
    setWaveformMorph(waveformFromPointer(event));
    waveformDrag = null;
    try { waveformDial.releasePointerCapture(event.pointerId); } catch (_) {}
  });
  waveformDial.addEventListener('pointercancel', () => { waveformDrag = null; });
  waveformDial.addEventListener('wheel', (event) => {
    event.preventDefault();
    setWaveformMorph(state.waveformMorph + (event.deltaY < 0 ? .04 : -.04));
  }, { passive:false });
  waveformDial.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? .01 : .04;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); setWaveformMorph(state.waveformMorph + step); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); setWaveformMorph(state.waveformMorph - step); }
    else if (event.key === 'Home') { event.preventDefault(); setWaveformMorph(0); }
  });
  document.querySelectorAll('.wave-anchor').forEach((button) => {
    button.addEventListener('click', (event) => { event.stopPropagation(); setWaveformMorph(Number(button.dataset.waveIndex)); });
  });

  $('overRichness').addEventListener('input', (event) => { state.overRichness = Number(event.target.value); $('overRichnessValue').textContent = event.target.value; syncEngine(); });
  $('subRichness').addEventListener('input', (event) => { state.subRichness = Number(event.target.value); $('subRichnessValue').textContent = event.target.value; syncEngine(); });
  $('fundamentalEnabled').addEventListener('change', (event) => { state.fundamentalEnabled = event.target.checked; $('fundamentalState').textContent = state.fundamentalEnabled ? 'active' : 'coupée'; syncEngine(); });
  $('centsSlider').addEventListener('input', (event) => { state.cents = Number(event.target.value); updateFineUI(); updateFrequencyUI(); syncEngine(); updateDiagnostics(); });
  $('masterVolume').addEventListener('input', (event) => { state.masterVolume = Number(event.target.value) / 100; $('masterVolumeValue').textContent = `${event.target.value} %`; syncEngine(); });

  $('toggleTone').addEventListener('click', async () => {
    try {
      if (engine.isPlaying) { engine.stop(); setPlayingUI(false); }
      else { syncEngine(); await engine.start(); setPlayingUI(true); }
      updateDiagnostics();
    } catch (err) {
      setPlayingUI(false);
      alert(`Impossible de démarrer l’audio : ${err.message}`);
    }
  });
  $('panicStop').addEventListener('click', () => { engine.panic(); setPlayingUI(false); });
  window.addEventListener('pagehide', () => engine.panic());
  document.addEventListener('visibilitychange', () => { if (document.hidden && engine.isPlaying) { engine.stop(); setPlayingUI(false); } });

  positionFrequencyMarks();
  window.addEventListener('resize', positionFrequencyMarks, { passive: true });
  updateFineUI();
  updateWaveformUI();
  syncEngine();
  updateFrequencyUI();
  updateDiagnostics();
  drawWavePreview(0);
})();

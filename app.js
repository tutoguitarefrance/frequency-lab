(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const engine = new window.FrequencyGeneratorEngine({ requestedSampleRate: 96000 });

  const WAVEFORMS = ['sine', 'triangle', 'square', 'sawtooth'];
  const waveformNames = {
    sine: 'SINUSOÏDE',
    triangle: 'TRIANGLE',
    square: 'CARRÉE',
    sawtooth: 'DENT DE SCIE'
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

  const knob = $('frequencyKnob');
  const frequencyInput = $('frequencyInput');
  const frequencyReadout = $('frequencyReadout');
  const ring = $('waveformRing');
  const canvas = $('oscilloscope');
  const ctx = canvas.getContext('2d');
  let scopeFrame = null;
  let dragging = false;
  let touchDialState = null;
  let manualHoldState = null;
  let morphDragging = false;
  let morphFrame = null;
  let pendingMorph = 0;

  const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const LONG_PRESS_MS = 520;
  const LONG_PRESS_MOVE_PX = 12;
  const TOUCH_CENTS_PER_DEGREE = 4;

  if (coarsePointer) {
    frequencyInput.readOnly = true;
    frequencyInput.setAttribute('aria-readonly', 'true');
  } else {
    $('manualFrequencyHint').hidden = true;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function centsFactor(cents = state.cents) {
    return Math.pow(2, cents / 1200);
  }

  function effectiveFrequency() {
    if (state.baseFrequency <= 0) return 0;
    return Math.min(25000, state.baseFrequency * centsFactor());
  }

  function formatHz(value) {
    if (!Number.isFinite(value)) return '—';
    if (value >= 10000) return value.toFixed(1);
    if (value >= 1000) return value.toFixed(2);
    return value.toFixed(3);
  }

  function nearestNote(freq) {
    if (!Number.isFinite(freq) || freq <= 0) return { name: 'DC', cents: 0 };
    const midi = 69 + 12 * Math.log2(freq / 440);
    const nearest = Math.round(midi);
    const cents = Math.round((midi - nearest) * 100);
    const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const note = names[((nearest % 12) + 12) % 12];
    const octave = Math.floor(nearest / 12) - 1;
    return { name: `${note}${octave}`, cents };
  }

  function frequencyToAngle(freq) {
    if (freq <= 0) return -135;
    const normalized = Math.log10(1 + freq) / Math.log10(25001);
    return -135 + normalized * 270;
  }

  function angleToFrequency(angle) {
    const normalized = clamp((angle + 135) / 270, 0, 1);
    if (normalized <= 0.002) return 0;
    return Math.pow(25001, normalized) - 1;
  }

  function morphMix(position) {
    const wrapped = ((position % 4) + 4) % 4;
    const index = Math.floor(wrapped);
    const next = (index + 1) % 4;
    const t = wrapped - index;
    const mix = { sine: 0, triangle: 0, square: 0, sawtooth: 0 };
    // Mélange linéaire : somme des gains = 1, donc le niveau reste stable.
    mix[WAVEFORMS[index]] = 1 - t;
    mix[WAVEFORMS[next]] = t;
    return { mix, index, next, t, wrapped };
  }

  function buildPartials() {
    const partials = [];
    if (state.fundamentalEnabled) {
      // Sans propriété waveform : le moteur applique le morphing continu.
      partials.push({ id: 'fundamental', ratio: 1, level: 1, enabled: true });
    }

    const over = state.overRichness / 100;
    const overCount = over === 0 ? 0 : Math.max(1, Math.ceil(over * 9));
    for (let i = 0; i < overCount; i += 1) {
      const n = i + 2;
      const threshold = i / 9;
      const activation = clamp((over - threshold) * 9, 0, 1);
      const level = activation * over * (0.34 / Math.pow(n - 1, 0.68));
      partials.push({ id: `over-${n}`, ratio: n, level, enabled: level > 0.0005, waveform: 'sine' });
    }

    const sub = state.subRichness / 100;
    const subCount = sub === 0 ? 0 : Math.max(1, Math.ceil(sub * 5));
    for (let i = 0; i < subCount; i += 1) {
      const n = i + 2;
      const threshold = i / 5;
      const activation = clamp((sub - threshold) * 5, 0, 1);
      const level = activation * sub * (0.22 / Math.pow(n - 1, 0.55));
      partials.push({ id: `sub-${n}`, ratio: 1 / n, level, enabled: level > 0.0005, waveform: 'sine' });
    }

    state.partials = partials;
    $('overCount').textContent = String(partials.filter(p => p.id.startsWith('over-') && p.enabled).length);
    $('subCount').textContent = String(partials.filter(p => p.id.startsWith('sub-') && p.enabled).length);
  }

  function syncEngine() {
    buildPartials();
    engine.setState(state);
  }

  function updateFineUI() {
    $('centsSlider').value = String(state.cents);
    $('centsOutput').textContent = `${state.cents > 0 ? '+' : ''}${state.cents} cent${Math.abs(state.cents) === 1 ? '' : 's'}`;
  }

  function updateDial() {
    const actual = effectiveFrequency();
    const angle = frequencyToAngle(actual);
    $('dialMarker').style.setProperty('--dial-angle', `${angle}deg`);
    knob.setAttribute('aria-valuenow', String(actual));
    knob.setAttribute('aria-valuetext', `${formatHz(actual)} hertz`);
    if (document.activeElement !== $('frequencyInput')) {
      frequencyInput.value = String(Number(actual.toFixed(3)));
    }
  }

  function updateDiagnostics() {
    const effective = effectiveFrequency();
    $('effectiveFrequency').textContent = formatHz(effective);
    const note = nearestNote(effective);
    $('noteHint').textContent = effective <= 0
      ? 'DC • non audible'
      : `${note.name} • ${note.cents > 0 ? '+' : ''}${note.cents} cent${Math.abs(note.cents) === 1 ? '' : 's'}`;

    const sr = engine.getSampleRate();
    const nyquist = engine.getNyquist();
    $('sampleRateValue').textContent = sr ? `${sr.toLocaleString('fr-FR')} Hz` : '—';
    $('nyquistValue').textContent = nyquist ? `${nyquist.toLocaleString('fr-FR')} Hz` : '—';
    $('sampleRateStatus').textContent = sr ? `Sample rate : ${sr.toLocaleString('fr-FR')} Hz` : 'Sample rate : —';

    if (nyquist) {
      const exceeds = effective >= nyquist;
      $('nyquistWarning').textContent = exceeds
        ? `⚠ ${formatHz(effective)} Hz dépasse Nyquist (${nyquist.toLocaleString('fr-FR')} Hz) : le signal est coupé pour éviter l’aliasing.`
        : `Limite numérique actuelle : ${nyquist.toLocaleString('fr-FR')} Hz. Les harmoniques qui la dépassent sont automatiquement coupées.`;
      $('nyquistWarning').classList.toggle('is-warning', exceeds);
    }
  }

  // La molette principale définit une nouvelle fréquence exacte et remet le réglage fin à zéro.
  // Ensuite le curseur ±100 cents décale réellement cette fréquence et l'affichage central suit.
  function commitFrequency(value, resetFine = true) {
    const target = clamp(Number(value) || 0, 0, 25000);
    state.baseFrequency = target;
    if (resetFine) {
      state.cents = 0;
      updateFineUI();
    }
    updateDial();
    syncEngine();
    updateDiagnostics();
  }

  function updateWaveformUI() {
    const data = morphMix(state.waveformMorph);
    state.waveformMix = data.mix;
    ring.style.setProperty('--wave-angle', `${data.wrapped * 90}deg`);
    ring.setAttribute('aria-valuenow', data.wrapped.toFixed(3));

    document.querySelectorAll('.wave-choice').forEach((marker) => {
      const weight = data.mix[marker.dataset.wave] || 0;
      marker.style.setProperty('--wave-weight', weight.toFixed(3));
      marker.classList.toggle('is-active', weight > 0.015);
      marker.classList.toggle('is-selected', weight > 0.985);
    });

    const a = WAVEFORMS[data.index];
    const b = WAVEFORMS[data.next];
    const aPct = Math.round((1 - data.t) * 100);
    const bPct = 100 - aPct;

    if (data.t < 0.005) {
      $('waveformLabel').textContent = `${waveformNames[a]} 100 %`;
      ring.setAttribute('aria-valuetext', `${waveformNames[a]} 100 %`);
      ring.dataset.waveform = a;
    } else if (data.t > 0.995) {
      $('waveformLabel').textContent = `${waveformNames[b]} 100 %`;
      ring.setAttribute('aria-valuetext', `${waveformNames[b]} 100 %`);
      ring.dataset.waveform = b;
    } else {
      const text = `${waveformNames[a]} ${aPct} %  •  ${waveformNames[b]} ${bPct} %`;
      $('waveformLabel').textContent = text;
      ring.setAttribute('aria-valuetext', text);
      ring.dataset.waveform = 'morph';
    }
  }

  function setWaveformMorph(position) {
    state.waveformMorph = ((Number(position) % 4) + 4) % 4;
    updateWaveformUI();
    syncEngine();
  }

  // Les mouvements tactiles/souris peuvent arriver plus vite que l'écran ne se redessine.
  // On applique au maximum une valeur de morphing par frame : le curseur et le son
  // suivent ainsi le doigt de façon continue, sans sauter entre quatre états.
  function scheduleWaveformMorph(position) {
    pendingMorph = position;
    if (morphFrame !== null) return;
    morphFrame = requestAnimationFrame(() => {
      morphFrame = null;
      setWaveformMorph(pendingMorph);
    });
  }

  function setPlayingUI(playing) {
    knob.classList.toggle('is-playing', playing);
    ring.classList.toggle('is-playing', playing);
    $('toggleTone').classList.toggle('is-playing', playing);
    $('toggleTone').setAttribute('aria-pressed', String(playing));
    $('toggleTone').querySelector('.play-symbol').textContent = playing ? '■' : '▶';
    $('toneButtonLabel').textContent = playing ? 'PAUSE' : 'PLAY';
    $('scopeState').textContent = playing ? 'OSCILLOSCOPE' : 'FRÉQUENCE';
    $('audioStatus').textContent = playing ? 'Audio actif' : 'Audio arrêté';
    $('audioStatus').classList.toggle('status-on', playing);
    $('audioStatus').classList.toggle('status-off', !playing);
    if (playing) startScope(); else stopScope();
  }

  function drawIdleScope() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function drawScope() {
    const analyser = engine.getAnalyser();
    if (!engine.isPlaying || !analyser) return;

    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, 'rgba(116,255,224,.35)');
    gradient.addColorStop(0.5, 'rgba(164,255,236,1)');
    gradient.addColorStop(1, 'rgba(116,255,224,.35)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 4;
    ctx.shadowColor = 'rgba(119,255,226,.75)';
    ctx.shadowBlur = 15;
    ctx.beginPath();

    const targetSamples = 420;
    const step = Math.max(1, Math.floor(data.length / targetSamples));
    let x = 0;
    const xStep = w / Math.ceil(data.length / step);
    for (let i = 0; i < data.length; i += step) {
      const y = h / 2 + data[i] * h * 0.36;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      x += xStep;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    scopeFrame = requestAnimationFrame(drawScope);
  }

  function startScope() {
    cancelAnimationFrame(scopeFrame);
    scopeFrame = requestAnimationFrame(drawScope);
  }

  function stopScope() {
    cancelAnimationFrame(scopeFrame);
    scopeFrame = null;
    drawIdleScope();
  }

  function pointerAngleFromPosition(event) {
    const rect = knob.getBoundingClientRect();
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

  function beginManualFrequencyEntry() {
    frequencyInput.readOnly = false;
    frequencyInput.removeAttribute('aria-readonly');
    frequencyReadout.classList.add('is-editing');
    $('manualFrequencyHint').textContent = 'Saisir la fréquence puis valider';
    // L'appel est effectué directement depuis pointerup : Firefox/Android
    // le considère comme une action utilisateur et ouvre le clavier virtuel.
    try { frequencyInput.focus({ preventScroll: true }); } catch (_) { frequencyInput.focus(); }
    try { frequencyInput.select(); } catch (_) {}
  }

  function finishManualFrequencyEntry() {
    commitFrequency(frequencyInput.value);
    frequencyReadout.classList.remove('is-editing', 'is-holding');
    if (coarsePointer) {
      frequencyInput.readOnly = true;
      frequencyInput.setAttribute('aria-readonly', 'true');
      $('manualFrequencyHint').textContent = 'Maintenir la fréquence pour saisir';
    }
  }

  function pointerFrequencyFromPosition(event) {
    const rect = knob.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let angle = Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI + 90;
    if (angle > 180) angle -= 360;
    angle = clamp(angle, -135, 135);
    return angleToFrequency(angle);
  }

  function pointerMorphFromPosition(event) {
    const rect = ring.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let angle = Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI + 90;
    if (angle < 0) angle += 360;
    return angle / 90;
  }

  knob.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.frequency-edit-row')) return;

    // Sur écran tactile, on ne mappe plus la position absolue du doigt à la
    // fréquence : cela provoquait des sauts énormes. La molette devient relative.
    if (event.pointerType === 'touch' || event.pointerType === 'pen' || coarsePointer) {
      dragging = true;
      const angle = pointerAngleFromPosition(event);
      touchDialState = {
        pointerId: event.pointerId,
        lastAngle: angle,
        frequency: Math.max(effectiveFrequency(), 1),
        moved: false
      };
      knob.setPointerCapture(event.pointerId);
      return;
    }

    dragging = true;
    knob.setPointerCapture(event.pointerId);
    commitFrequency(pointerFrequencyFromPosition(event));
  });

  knob.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    if (touchDialState && touchDialState.pointerId === event.pointerId) {
      event.preventDefault();
      const angle = pointerAngleFromPosition(event);
      const delta = normalizedAngleDelta(angle, touchDialState.lastAngle);
      touchDialState.lastAngle = angle;
      if (Math.abs(delta) < 0.05) return;
      touchDialState.moved = true;
      const factor = Math.pow(2, (delta * TOUCH_CENTS_PER_DEGREE) / 1200);
      touchDialState.frequency = clamp(touchDialState.frequency * factor, 0, 25000);
      commitFrequency(touchDialState.frequency);
      return;
    }

    commitFrequency(pointerFrequencyFromPosition(event));
  });

  knob.addEventListener('pointerup', (event) => {
    dragging = false;
    touchDialState = null;
    try { knob.releasePointerCapture(event.pointerId); } catch (_) {}
  });

  knob.addEventListener('pointercancel', () => {
    dragging = false;
    touchDialState = null;
  });

  knob.addEventListener('wheel', (event) => {
    event.preventDefault();
    const actual = effectiveFrequency();
    const direction = event.deltaY < 0 ? 1 : -1;
    const step = event.shiftKey ? 0.1 : Math.max(1, actual * 0.002);
    commitFrequency(actual + direction * step);
  }, { passive: false });

  knob.addEventListener('keydown', (event) => {
    const actual = effectiveFrequency();
    const step = event.shiftKey ? 0.1 : Math.max(1, actual * 0.002);
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      commitFrequency(actual + step);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      commitFrequency(actual - step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      commitFrequency(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      commitFrequency(25000);
    }
  });

  frequencyInput.addEventListener('change', (event) => {
    if (!coarsePointer) commitFrequency(event.target.value);
  });
  frequencyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  });
  frequencyInput.addEventListener('blur', () => {
    if (coarsePointer && !frequencyInput.readOnly) finishManualFrequencyEntry();
  });
  frequencyInput.addEventListener('click', (event) => event.stopPropagation());

  // Mobile : pression longue sur la valeur centrale, puis relâcher = clavier numérique.
  // Un tap court ne modifie rien et n'ouvre pas accidentellement le clavier.
  frequencyReadout.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    if (!coarsePointer && event.pointerType === 'mouse') return;
    if (!frequencyInput.readOnly) return;
    event.preventDefault();
    manualHoldState = {
      pointerId: event.pointerId,
      startedAt: performance.now(),
      x: event.clientX,
      y: event.clientY,
      cancelled: false
    };
    frequencyReadout.classList.add('is-holding');
    try { frequencyReadout.setPointerCapture(event.pointerId); } catch (_) {}
  });

  frequencyReadout.addEventListener('pointermove', (event) => {
    if (!manualHoldState || manualHoldState.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - manualHoldState.x, event.clientY - manualHoldState.y);
    if (distance > LONG_PRESS_MOVE_PX) {
      manualHoldState.cancelled = true;
      frequencyReadout.classList.remove('is-holding');
    }
  });

  frequencyReadout.addEventListener('pointerup', (event) => {
    if (!manualHoldState || manualHoldState.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const elapsed = performance.now() - manualHoldState.startedAt;
    const shouldEdit = !manualHoldState.cancelled && elapsed >= LONG_PRESS_MS;
    manualHoldState = null;
    frequencyReadout.classList.remove('is-holding');
    try { frequencyReadout.releasePointerCapture(event.pointerId); } catch (_) {}
    if (shouldEdit) beginManualFrequencyEntry();
  });

  frequencyReadout.addEventListener('pointercancel', () => {
    manualHoldState = null;
    frequencyReadout.classList.remove('is-holding');
  });

  frequencyReadout.addEventListener('contextmenu', (event) => {
    if (coarsePointer) event.preventDefault();
  });

  // Toute la couronne métallique est la commande. Les pictogrammes ne sont plus
  // quatre boutons : ce sont uniquement des repères sur une molette analogique.
  ring.addEventListener('pointerdown', (event) => {
    if (event.target.closest('#frequencyKnob')) return;
    event.preventDefault();
    morphDragging = true;
    ring.setPointerCapture(event.pointerId);
    scheduleWaveformMorph(pointerMorphFromPosition(event));
  });

  ring.addEventListener('pointermove', (event) => {
    if (!morphDragging) return;
    event.preventDefault();
    scheduleWaveformMorph(pointerMorphFromPosition(event));
  });

  ring.addEventListener('pointerup', (event) => {
    if (!morphDragging) return;
    scheduleWaveformMorph(pointerMorphFromPosition(event));
    morphDragging = false;
    try { ring.releasePointerCapture(event.pointerId); } catch (_) {}
  });

  ring.addEventListener('pointercancel', () => { morphDragging = false; });

  ring.addEventListener('wheel', (event) => {
    event.preventDefault();
    const step = event.shiftKey ? 0.01 : 0.04;
    const direction = event.deltaY < 0 ? 1 : -1;
    setWaveformMorph(state.waveformMorph + direction * step);
  }, { passive: false });

  ring.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.01 : 0.04;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setWaveformMorph(state.waveformMorph + step);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setWaveformMorph(state.waveformMorph - step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setWaveformMorph(0);
    }
  });

  $('overRichness').addEventListener('input', (event) => {
    state.overRichness = Number(event.target.value);
    $('overRichnessValue').textContent = event.target.value;
    syncEngine();
  });

  $('subRichness').addEventListener('input', (event) => {
    state.subRichness = Number(event.target.value);
    $('subRichnessValue').textContent = event.target.value;
    syncEngine();
  });

  $('fundamentalEnabled').addEventListener('change', (event) => {
    state.fundamentalEnabled = event.target.checked;
    $('fundamentalState').textContent = state.fundamentalEnabled ? 'active' : 'coupée';
    syncEngine();
  });

  $('centsSlider').addEventListener('input', (event) => {
    state.cents = Number(event.target.value);
    updateFineUI();
    updateDial();
    syncEngine();
    updateDiagnostics();
  });

  $('masterVolume').addEventListener('input', (event) => {
    state.masterVolume = Number(event.target.value) / 100;
    $('masterVolumeValue').textContent = `${event.target.value} %`;
    syncEngine();
  });

  document.querySelectorAll('[data-frequency]').forEach(button => {
    button.addEventListener('click', () => commitFrequency(Number(button.dataset.frequency)));
  });

  $('toggleTone').addEventListener('click', async () => {
    try {
      if (engine.isPlaying) {
        engine.stop();
        setPlayingUI(false);
      } else {
        syncEngine();
        await engine.start();
        setPlayingUI(true);
      }
      updateDiagnostics();
    } catch (err) {
      setPlayingUI(false);
      alert(`Impossible de démarrer l’audio : ${err.message}`);
    }
  });

  $('panicStop').addEventListener('click', () => {
    engine.panic();
    setPlayingUI(false);
  });

  window.addEventListener('pagehide', () => engine.panic());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && engine.isPlaying) {
      engine.stop();
      setPlayingUI(false);
    }
  });

  updateFineUI();
  updateWaveformUI();
  buildPartials();
  syncEngine();
  updateDial();
  updateDiagnostics();
  drawIdleScope();
})();

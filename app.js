(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const engine = new window.FrequencyGeneratorEngine({ requestedSampleRate: 96000 });

  const state = {
    baseFrequency: 440,
    cents: 0,
    waveform: 'sine',
    masterVolume: 0.25,
    autoNormalize: true,
    fundamentalEnabled: true,
    overRichness: 0,
    subRichness: 0,
    partials: []
  };

  const waveformNames = {
    sine: 'SINUSOÏDE',
    triangle: 'TRIANGLE',
    square: 'CARRÉE',
    sawtooth: 'DENT DE SCIE'
  };

  const knob = $('frequencyKnob');
  const canvas = $('oscilloscope');
  const ctx = canvas.getContext('2d');
  let scopeFrame = null;
  let dragStartY = 0;
  let dragStartFrequency = 440;
  let dragging = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function centsFrequency(base, cents) {
    if (base <= 0) return 0;
    return base * Math.pow(2, cents / 1200);
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

  function buildPartials() {
    const partials = [];
    if (state.fundamentalEnabled) {
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

  function updateDial() {
    const angle = frequencyToAngle(state.baseFrequency);
    $('dialMarker').style.setProperty('--dial-angle', `${angle}deg`);
    knob.setAttribute('aria-valuenow', String(state.baseFrequency));
    knob.setAttribute('aria-valuetext', `${formatHz(state.baseFrequency)} hertz`);
    if (document.activeElement !== $('frequencyInput')) $('frequencyInput').value = String(Number(state.baseFrequency.toFixed(3)));
  }

  function updateDiagnostics() {
    const effective = centsFrequency(state.baseFrequency, state.cents);
    $('effectiveFrequency').textContent = formatHz(effective);
    const note = nearestNote(effective);
    $('noteHint').textContent = effective <= 0 ? 'DC • non audible' : `${note.name} • ${note.cents > 0 ? '+' : ''}${note.cents} cent${Math.abs(note.cents) === 1 ? '' : 's'}`;

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

  function commitFrequency(value) {
    state.baseFrequency = clamp(Number(value) || 0, 0, 25000);
    updateDial();
    syncEngine();
    updateDiagnostics();
  }

  function setWaveform(waveform) {
    state.waveform = waveform;
    $('waveformRing').dataset.waveform = waveform;
    $('waveformLabel').textContent = waveformNames[waveform];
    document.querySelectorAll('.wave-choice').forEach(btn => {
      btn.classList.toggle('is-selected', btn.dataset.wave === waveform);
    });
    syncEngine();
  }

  function setPlayingUI(playing) {
    knob.classList.toggle('is-playing', playing);
    $('waveformRing').classList.toggle('is-playing', playing);
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
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
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

  function pointerFrequencyFromPosition(event) {
    const rect = knob.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let angle = Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI + 90;
    if (angle > 180) angle -= 360;
    angle = clamp(angle, -135, 135);
    return angleToFrequency(angle);
  }

  knob.addEventListener('pointerdown', (event) => {
    if (event.target.closest('input')) return;
    dragging = true;
    dragStartY = event.clientY;
    dragStartFrequency = state.baseFrequency;
    knob.setPointerCapture(event.pointerId);
    commitFrequency(pointerFrequencyFromPosition(event));
  });

  knob.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    if (event.shiftKey) {
      const delta = dragStartY - event.clientY;
      const scale = Math.max(0.01, dragStartFrequency * 0.0025);
      commitFrequency(dragStartFrequency + delta * scale);
    } else {
      commitFrequency(pointerFrequencyFromPosition(event));
    }
  });

  knob.addEventListener('pointerup', (event) => {
    dragging = false;
    try { knob.releasePointerCapture(event.pointerId); } catch (_) {}
  });

  knob.addEventListener('wheel', (event) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const step = event.shiftKey ? 0.1 : Math.max(1, state.baseFrequency * 0.002);
    commitFrequency(state.baseFrequency + direction * step);
  }, { passive: false });

  knob.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.1 : Math.max(1, state.baseFrequency * 0.002);
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      commitFrequency(state.baseFrequency + step);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      commitFrequency(state.baseFrequency - step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      commitFrequency(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      commitFrequency(25000);
    }
  });

  $('frequencyInput').addEventListener('input', (event) => commitFrequency(event.target.value));
  $('frequencyInput').addEventListener('click', (event) => event.stopPropagation());
  $('frequencyInput').addEventListener('pointerdown', (event) => event.stopPropagation());

  document.querySelectorAll('.wave-choice').forEach(button => {
    button.addEventListener('click', () => setWaveform(button.dataset.wave));
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
    $('centsOutput').textContent = `${state.cents > 0 ? '+' : ''}${state.cents} cent${Math.abs(state.cents) === 1 ? '' : 's'}`;
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

  buildPartials();
  syncEngine();
  updateDial();
  updateDiagnostics();
  drawIdleScope();
})();

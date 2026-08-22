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
    partials: [
      { id: 'fundamental', label: 'Fondamentale', ratio: 1, level: 1, enabled: true, locked: true }
    ]
  };

  let nextOvertone = 2;
  let nextSubharmonic = 2;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatHz(value) {
    if (!Number.isFinite(value)) return '—';
    if (value >= 10000) return value.toFixed(1);
    if (value >= 1000) return value.toFixed(2);
    return value.toFixed(3);
  }

  function formatRatio(ratio) {
    if (ratio === 1) return '1×';
    if (ratio > 1) return `${ratio.toFixed(Number.isInteger(ratio) ? 0 : 3)}×`;
    const inv = 1 / ratio;
    if (Math.abs(inv - Math.round(inv)) < 1e-8) return `1/${Math.round(inv)}`;
    return ratio.toFixed(4) + '×';
  }

  function centsFrequency(base, cents) {
    if (base <= 0) return 0;
    return base * Math.pow(2, cents / 1200);
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

  function syncEngine() {
    engine.setState(state);
  }

  function updateDiagnostics() {
    const detuned = centsFrequency(state.baseFrequency, state.cents);
    $('requestedFrequency').textContent = formatHz(state.baseFrequency);
    $('detunedFrequency').textContent = formatHz(detuned);
    $('effectiveFrequency').textContent = formatHz(detuned);

    const note = nearestNote(detuned);
    $('noteHint').textContent = detuned <= 0 ? 'DC • non audible' : `${note.name} • ${note.cents > 0 ? '+' : ''}${note.cents} cent${Math.abs(note.cents) === 1 ? '' : 's'}`;

    const sr = engine.getSampleRate();
    const nyquist = engine.getNyquist();
    $('sampleRateValue').textContent = sr ? `${sr.toLocaleString('fr-FR')} Hz` : '—';
    $('nyquistValue').textContent = nyquist ? `${nyquist.toLocaleString('fr-FR')} Hz` : '—';
    $('sampleRateStatus').textContent = sr ? `Sample rate : ${sr.toLocaleString('fr-FR')} Hz` : 'Sample rate : —';

    if (nyquist) {
      $('nyquistInfo').textContent = `AudioContext actif à ${sr.toLocaleString('fr-FR')} Hz : fréquences représentables jusqu’à ${nyquist.toLocaleString('fr-FR')} Hz avant Nyquist. Les composantes au-dessus sont automatiquement coupées pour éviter l’aliasing.`;
    }
  }

  function updateNormalizationInfo() {
    const active = state.partials.filter(p => p.enabled && p.level > 0);
    const sum = active.reduce((acc, p) => acc + p.level, 0);
    const factor = state.autoNormalize && sum > 1 ? 1 / sum : 1;
    $('normalizationInfo').textContent = `Normalisation : ${(factor * 100).toFixed(1)} % • somme des niveaux : ${(sum * 100).toFixed(0)} %`;
  }

  function renderPartials() {
    const body = $('partialsBody');
    body.innerHTML = '';
    const detuned = centsFrequency(state.baseFrequency, state.cents);
    const nyquist = engine.getNyquist();

    for (const partial of state.partials) {
      const tr = document.createElement('tr');
      const componentFreq = detuned * partial.ratio;
      const aboveNyquist = nyquist && componentFreq >= nyquist;

      tr.innerHTML = `
        <td><input class="partial-enabled" type="checkbox" ${partial.enabled ? 'checked' : ''} aria-label="Activer ${partial.label}"></td>
        <td><strong>${partial.label}</strong></td>
        <td><span>${formatRatio(partial.ratio)}</span></td>
        <td class="frequency-cell">${formatHz(componentFreq)} Hz${aboveNyquist ? ' <span title="Au-dessus de Nyquist">⚠</span>' : ''}</td>
        <td>
          <div class="slider-with-value">
            <input class="partial-level range" type="range" min="0" max="100" step="1" value="${Math.round(partial.level * 100)}" aria-label="Niveau ${partial.label}">
            <output>${Math.round(partial.level * 100)} %</output>
          </div>
        </td>
        <td>${partial.locked ? '' : '<button class="remove-partial" type="button">Supprimer</button>'}</td>
      `;

      tr.querySelector('.partial-enabled').addEventListener('change', (e) => {
        partial.enabled = e.target.checked;
        syncEngine();
        updateNormalizationInfo();
      });

      const level = tr.querySelector('.partial-level');
      const levelOut = level.nextElementSibling;
      level.addEventListener('input', (e) => {
        partial.level = Number(e.target.value) / 100;
        levelOut.textContent = `${e.target.value} %`;
        syncEngine();
        updateNormalizationInfo();
      });

      const remove = tr.querySelector('.remove-partial');
      if (remove) {
        remove.addEventListener('click', () => {
          state.partials = state.partials.filter(p => p.id !== partial.id);
          syncEngine();
          renderPartials();
        });
      }

      body.appendChild(tr);
    }

    updateNormalizationInfo();
  }

  function updateFrequencyUI(source) {
    state.baseFrequency = clamp(Number(state.baseFrequency) || 0, 0, 25000);
    if (source !== 'number') $('frequencyInput').value = state.baseFrequency;
    if (source !== 'slider') $('frequencySlider').value = state.baseFrequency;
    syncEngine();
    updateDiagnostics();
    renderPartials();
  }

  function updateCentsUI(source) {
    state.cents = clamp(Number(state.cents) || 0, -100, 100);
    if (source !== 'number') $('centsInput').value = state.cents;
    if (source !== 'slider') $('centsSlider').value = state.cents;
    syncEngine();
    updateDiagnostics();
    renderPartials();
  }

  function setPlayingUI(playing) {
    const button = $('toggleTone');
    button.classList.toggle('is-playing', playing);
    button.setAttribute('aria-pressed', String(playing));
    button.querySelector('.tone-icon').textContent = playing ? '■' : '▶';
    $('toneButtonLabel').textContent = playing ? 'Arrêter le son' : 'Émettre le son';
    $('audioStatus').textContent = playing ? 'Audio actif' : 'Audio arrêté';
    $('audioStatus').classList.toggle('status-on', playing);
    $('audioStatus').classList.toggle('status-off', !playing);
  }

  $('frequencyInput').addEventListener('input', (e) => {
    state.baseFrequency = Number(e.target.value);
    updateFrequencyUI('number');
  });

  $('frequencySlider').addEventListener('input', (e) => {
    state.baseFrequency = Number(e.target.value);
    updateFrequencyUI('slider');
  });

  $('centsInput').addEventListener('input', (e) => {
    state.cents = Number(e.target.value);
    updateCentsUI('number');
  });

  $('centsSlider').addEventListener('input', (e) => {
    state.cents = Number(e.target.value);
    updateCentsUI('slider');
  });

  $('waveform').addEventListener('change', (e) => {
    state.waveform = e.target.value;
    syncEngine();
  });

  $('masterVolume').addEventListener('input', (e) => {
    state.masterVolume = Number(e.target.value) / 100;
    $('masterVolumeValue').textContent = `${e.target.value} %`;
    syncEngine();
  });

  $('autoNormalize').addEventListener('change', (e) => {
    state.autoNormalize = e.target.checked;
    syncEngine();
    updateNormalizationInfo();
  });

  document.querySelectorAll('[data-frequency]').forEach(button => {
    button.addEventListener('click', () => {
      state.baseFrequency = Number(button.dataset.frequency);
      updateFrequencyUI();
    });
  });

  $('addOvertone').addEventListener('click', () => {
    const n = nextOvertone++;
    state.partials.push({
      id: `over-${Date.now()}-${n}`,
      label: `Sur-harmonique ${n}`,
      ratio: n,
      level: Math.max(0.05, 0.5 / n),
      enabled: true,
      locked: false
    });
    syncEngine();
    renderPartials();
  });

  $('addSubharmonic').addEventListener('click', () => {
    const n = nextSubharmonic++;
    state.partials.push({
      id: `sub-${Date.now()}-${n}`,
      label: `Sub-harmonique 1/${n}`,
      ratio: 1 / n,
      level: 0.25,
      enabled: true,
      locked: false
    });
    syncEngine();
    renderPartials();
  });

  $('resetPartials').addEventListener('click', () => {
    state.partials = [{ id: 'fundamental', label: 'Fondamentale', ratio: 1, level: 1, enabled: true, locked: true }];
    nextOvertone = 2;
    nextSubharmonic = 2;
    syncEngine();
    renderPartials();
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
      renderPartials();
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

  syncEngine();
  updateDiagnostics();
  renderPartials();
})();

(function () {
  'use strict';

  const MORPH_WAVEFORMS = ['sine', 'triangle', 'square', 'sawtooth'];

  class FrequencyGeneratorEngine {
    constructor(options = {}) {
      this.requestedSampleRate = options.requestedSampleRate || 96000;
      this.context = null;
      this.masterGain = null;
      this.analyser = null;
      this.nodes = new Map();
      this.isPlaying = false;
      this.baseFrequency = 440;
      this.cents = 0;
      this.masterVolume = 0.25;
      this.autoNormalize = true;
      this.partials = [];
      this.waveformMix = { sine: 1, triangle: 0, square: 0, sawtooth: 0 };
      this.phaseInverted = false;
      // Compensation additive de la chaîne de sortie/mesure.
      // Réglable depuis l'interface ; appliquée à CHAQUE fréquence nominale
      // après calcul du ratio d'octave, afin qu'un même offset mesuré reste corrigé
      // à 440 Hz comme à 880 Hz.
      this.outputCalibrationHz = -0.05;
    }

    async ensureContext() {
      if (!this.context || this.context.state === 'closed') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error('Web Audio API non disponible sur ce navigateur.');

        try {
          this.context = new AudioCtx({ sampleRate: this.requestedSampleRate, latencyHint: 'interactive' });
        } catch (_) {
          this.context = new AudioCtx({ latencyHint: 'interactive' });
        }

        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = 0;

        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.12;

        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.context.destination);
      }

      if (this.context.state === 'suspended') await this.context.resume();
      return this.context;
    }

    getSampleRate() {
      return this.context ? this.context.sampleRate : null;
    }

    getNyquist() {
      return this.context ? this.context.sampleRate / 2 : null;
    }

    getAnalyser() {
      return this.analyser;
    }

    getDetunedFundamental() {
      if (this.baseFrequency <= 0) return 0;
      return Math.min(25000, this.baseFrequency * Math.pow(2, this.cents / 1200));
    }

    setState({ baseFrequency, cents, masterVolume, autoNormalize, partials, waveformMix, phaseInverted, outputCalibrationHz }) {
      if (typeof baseFrequency === 'number') this.baseFrequency = Math.max(0, Math.min(25000, baseFrequency));
      if (typeof cents === 'number') this.cents = Math.max(-100, Math.min(100, cents));
      if (typeof masterVolume === 'number') this.masterVolume = Math.max(0, Math.min(1, masterVolume));
      if (typeof autoNormalize === 'boolean') this.autoNormalize = autoNormalize;
      if (Array.isArray(partials)) this.partials = partials.map(p => ({ ...p }));
      if (typeof phaseInverted === 'boolean') this.phaseInverted = phaseInverted;
      if (typeof outputCalibrationHz === 'number' && Number.isFinite(outputCalibrationHz)) {
        this.outputCalibrationHz = Math.max(-2, Math.min(2, outputCalibrationHz));
      }
      if (waveformMix && typeof waveformMix === 'object') {
        const next = {};
        MORPH_WAVEFORMS.forEach(wave => {
          next[wave] = Math.max(0, Math.min(1, Number(waveformMix[wave]) || 0));
        });
        this.waveformMix = next;
      }
      if (this.isPlaying) this.syncNodes();
    }

    effectiveFrequencyForRatio(ratio) {
      // La calibration est ADDITIVE et appliquée après le ratio :
      // 440 Hz -> 439,95 Hz et 880 Hz -> 879,95 Hz avec -0,05 Hz.
      // On évite ainsi de doubler la correction sur les octaves.
      const nominal = this.getDetunedFundamental() * ratio;
      const f = nominal > 0 ? Math.max(0, nominal + this.outputCalibrationHz) : 0;
      if (!this.context) return f;
      const nyquist = this.getNyquist();
      if (!nyquist || f <= 0) return Math.max(0, f);
      return f < nyquist ? f : null;
    }

    normalizationFactor() {
      const enabled = this.partials.filter(p => p.enabled && p.level > 0);
      if (!enabled.length || !this.autoNormalize) return 1;
      const sum = enabled.reduce((acc, p) => acc + p.level, 0);
      return sum > 1 ? 1 / sum : 1;
    }

    voicesForPartial(partial, factor) {
      const phaseSign = this.phaseInverted ? -1 : 1;

      // Toutes les composantes (fondamentale et octaves supérieures/inférieures) héritent
      // de la même forme d’onde morphée. Ainsi, le cadran de forme reste audible
      // même lorsque la fondamentale est coupée.
      return MORPH_WAVEFORMS.map(waveform => ({
        id: `${partial.id}::${waveform}`,
        waveform,
        gain: phaseSign * partial.level * factor * (this.waveformMix[waveform] || 0)
      }));
    }

    async start() {
      await this.ensureContext();
      if (this.isPlaying) return;
      this.isPlaying = true;
      this.syncNodes(true);
      const now = this.context.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(0, now);
      this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, now + 0.025);
    }

    stop() {
      if (!this.context || !this.masterGain) {
        this.isPlaying = false;
        return;
      }
      const now = this.context.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0, now + 0.02);
      window.setTimeout(() => this.destroyOscillators(), 35);
      this.isPlaying = false;
    }

    panic() {
      this.destroyOscillators();
      if (this.masterGain && this.context) this.masterGain.gain.setValueAtTime(0, this.context.currentTime);
      this.isPlaying = false;
    }

    destroyOscillators() {
      for (const node of this.nodes.values()) {
        try { node.osc.stop(); } catch (_) {}
        try { node.osc.disconnect(); } catch (_) {}
        try { node.gain.disconnect(); } catch (_) {}
      }
      this.nodes.clear();
    }

    syncNodes(forceCreate = false) {
      if (!this.context || !this.masterGain || !this.isPlaying) return;
      const now = this.context.currentTime;
      const factor = this.normalizationFactor();
      const wantedIds = new Set();

      for (const partial of this.partials) {
        if (!partial.enabled || partial.level <= 0) continue;
        const freq = this.effectiveFrequencyForRatio(partial.ratio);
        if (freq === null || freq <= 0) continue;

        const voices = this.voicesForPartial(partial, factor);
        for (const voice of voices) {
          wantedIds.add(voice.id);
          let node = this.nodes.get(voice.id);

          if (!node || forceCreate) {
            if (node) {
              try { node.osc.stop(); } catch (_) {}
              try { node.osc.disconnect(); } catch (_) {}
              try { node.gain.disconnect(); } catch (_) {}
            }

            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            osc.type = voice.waveform;
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(forceCreate ? voice.gain : 0, now);
            if (!forceCreate) gain.gain.setTargetAtTime(voice.gain, now, 0.025);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now);
            node = { osc, gain, waveform: voice.waveform };
            this.nodes.set(voice.id, node);
          } else {
            node.osc.frequency.setTargetAtTime(freq, now, 0.006);
            node.gain.gain.cancelScheduledValues(now);
            node.gain.gain.setTargetAtTime(voice.gain, now, 0.025);
          }
        }
      }

      for (const [id, node] of this.nodes.entries()) {
        if (!wantedIds.has(id)) {
          try {
            node.gain.gain.cancelScheduledValues(now);
            node.gain.gain.setTargetAtTime(0, now, 0.006);
            node.osc.stop(now + 0.035);
          } catch (_) {}
          window.setTimeout(() => {
            try { node.osc.disconnect(); } catch (_) {}
            try { node.gain.disconnect(); } catch (_) {}
          }, 45);
          this.nodes.delete(id);
        }
      }

      this.masterGain.gain.setTargetAtTime(this.masterVolume, now, 0.01);
    }
  }

  window.FrequencyGeneratorEngine = FrequencyGeneratorEngine;
})();

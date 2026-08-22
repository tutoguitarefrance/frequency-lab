(function () {
  'use strict';

  class FrequencyGeneratorEngine {
    constructor(options = {}) {
      this.requestedSampleRate = options.requestedSampleRate || 96000;
      this.context = null;
      this.masterGain = null;
      this.nodes = new Map();
      this.isPlaying = false;
      this.baseFrequency = 440;
      this.cents = 0;
      this.waveform = 'sine';
      this.masterVolume = 0.25;
      this.autoNormalize = true;
      this.partials = [];
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
        this.masterGain.connect(this.context.destination);
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

    getDetunedFundamental() {
      if (this.baseFrequency <= 0) return 0;
      return this.baseFrequency * Math.pow(2, this.cents / 1200);
    }

    setState({ baseFrequency, cents, waveform, masterVolume, autoNormalize, partials }) {
      if (typeof baseFrequency === 'number') this.baseFrequency = Math.max(0, Math.min(25000, baseFrequency));
      if (typeof cents === 'number') this.cents = Math.max(-100, Math.min(100, cents));
      if (waveform) this.waveform = waveform;
      if (typeof masterVolume === 'number') this.masterVolume = Math.max(0, Math.min(1, masterVolume));
      if (typeof autoNormalize === 'boolean') this.autoNormalize = autoNormalize;
      if (Array.isArray(partials)) this.partials = partials.map(p => ({ ...p }));
      if (this.isPlaying) this.syncNodes();
    }

    effectiveFrequencyForRatio(ratio) {
      const f = this.getDetunedFundamental() * ratio;
      if (!this.context) return f;
      const nyquist = this.getNyquist();
      if (!nyquist || f <= 0) return Math.max(0, f);
      // Keep the oscillator below Nyquist. Components above it are muted rather than aliased.
      return f < nyquist ? f : null;
    }

    normalizationFactor() {
      const enabled = this.partials.filter(p => p.enabled && p.level > 0);
      if (!enabled.length) return 1;
      if (!this.autoNormalize) return 1;
      const sum = enabled.reduce((acc, p) => acc + p.level, 0);
      return sum > 1 ? 1 / sum : 1;
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
        wantedIds.add(partial.id);

        let node = this.nodes.get(partial.id);
        if (!node || forceCreate) {
          if (node) {
            try { node.osc.stop(); } catch (_) {}
            try { node.osc.disconnect(); } catch (_) {}
            try { node.gain.disconnect(); } catch (_) {}
          }
          const osc = this.context.createOscillator();
          const gain = this.context.createGain();
          osc.type = this.waveform;
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(partial.level * factor, now);
          osc.connect(gain);
          gain.connect(this.masterGain);
          osc.start();
          node = { osc, gain };
          this.nodes.set(partial.id, node);
        } else {
          node.osc.type = this.waveform;
          node.osc.frequency.setTargetAtTime(freq, now, 0.006);
          node.gain.gain.setTargetAtTime(partial.level * factor, now, 0.006);
        }
      }

      for (const [id, node] of this.nodes.entries()) {
        if (!wantedIds.has(id)) {
          try { node.osc.stop(now + 0.01); } catch (_) {}
          try { node.osc.disconnect(); } catch (_) {}
          try { node.gain.disconnect(); } catch (_) {}
          this.nodes.delete(id);
        }
      }

      this.masterGain.gain.setTargetAtTime(this.masterVolume, now, 0.01);
    }
  }

  window.FrequencyGeneratorEngine = FrequencyGeneratorEngine;
})();

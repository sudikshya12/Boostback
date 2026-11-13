/**
 * Original synthesized audio (Web Audio API). No sample files, no licensed
 * assets. The context is only created after a user gesture.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private rcsGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.7;
  private muted = false;

  /** Call from a user gesture (click / key press). Safe to call repeatedly. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.applyVolume();

    // Brown-ish noise buffer shared by engine, thrusters and impacts.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    this.noise = buf;

    // Engine: looping noise through a low-pass filter whose cutoff follows thrust.
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 200;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    src.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    src.start();

    // Cold-gas thrusters: high-passed hiss.
    const hiss = ctx.createBufferSource();
    hiss.buffer = buf;
    hiss.loop = true;
    hiss.playbackRate.value = 3;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    this.rcsGain = ctx.createGain();
    this.rcsGain.gain.value = 0;
    hiss.connect(hp).connect(this.rcsGain).connect(this.master);
    hiss.start();
  }

  setVolume(volume: number, muted: boolean) {
    this.volume = volume;
    this.muted = muted;
    this.applyVolume();
  }

  private applyVolume() {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.8, this.ctx.currentTime, 0.05);
  }

  /** Continuous engine and thruster level, called every frame. */
  setEngine(throttle: number, rcs: number) {
    if (!this.ctx || !this.engineGain || !this.engineFilter || !this.rcsGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(throttle > 0.001 ? 0.12 + throttle * 0.55 : 0, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(160 + throttle * 700, t, 0.08);
    this.rcsGain.gain.setTargetAtTime(Math.min(1, Math.abs(rcs)) * 0.05, t, 0.03);
  }

  silence() {
    this.setEngine(0, 0);
  }

  legs() {
    this.tone(90, 0.18, 0.25, 'triangle');
    this.burst(0.12, 0.08, 900);
  }

  success() {
    this.tone(523.25, 0.5, 0.12, 'sine', 0);
    this.tone(783.99, 0.7, 0.1, 'sine', 0.14);
  }

  crash(intensity = 1) {
    this.burst(1.4, 0.6 * intensity, 600);
    this.tone(55, 0.8, 0.35 * intensity, 'sine');
  }

  splash() {
    this.burst(1.6, 0.35, 2200);
  }

  click() {
    this.tone(880, 0.05, 0.04, 'sine');
  }

  suspend() {
    this.silence();
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private burst(dur: number, gain: number, cutoff: number) {
    if (!this.ctx || !this.master || !this.noise) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t0);
    f.frequency.exponentialRampToValueAtTime(80, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur);
  }
}

export const audio = new AudioEngine();

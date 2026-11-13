export class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.sfx = null;
    this.ambient = null;
    this.muted = false;
    this.initialized = false;
    this.birdTimer = null;
    this.stepTimer = 0;
  }

  init() {
    if (this.initialized) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.context.destination);

    this.sfx = this.context.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);

    this.ambient = this.context.createGain();
    this.ambient.gain.value = 0.9;
    this.ambient.connect(this.master);

    this.createWind();
    this.scheduleBird();
    this.initialized = true;

    if (this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  createWind() {
    const duration = 4;
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 2.8;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 720;
    filter.Q.value = 0.35;

    const gain = this.context.createGain();
    gain.gain.value = 0.035;

    const lfo = this.context.createOscillator();
    const lfoGain = this.context.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambient);
    source.start();
  }

  scheduleBird() {
    if (this.birdTimer) window.clearTimeout(this.birdTimer);
    const delay = 4500 + Math.random() * 9000;
    this.birdTimer = window.setTimeout(() => {
      if (this.initialized) {
        this.chirp();
        this.scheduleBird();
      }
    }, delay);
  }

  chirp() {
    if (!this.context) return;
    const now = this.context.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i += 1) {
      const start = now + i * (0.12 + Math.random() * 0.08);
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = 'sine';
      const base = 1700 + Math.random() * 1100;
      oscillator.frequency.setValueAtTime(base, start);
      oscillator.frequency.exponentialRampToValueAtTime(base * (1.12 + Math.random() * 0.25), start + 0.08);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.012, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      oscillator.connect(gain);
      gain.connect(this.ambient);
      oscillator.start(start);
      oscillator.stop(start + 0.16);
    }
  }

  createTone({ frequency, endFrequency, duration, type = 'sine', volume = 0.1, delay = 0 }) {
    if (!this.context) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.sfx);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  coin() {
    this.init();
    this.createTone({ frequency: 880, duration: 0.12, type: 'triangle', volume: 0.16 });
    this.createTone({ frequency: 1174, duration: 0.18, type: 'triangle', volume: 0.14, delay: 0.07 });
    this.createTone({ frequency: 1568, duration: 0.3, type: 'sine', volume: 0.12, delay: 0.14 });
  }

  jump() {
    this.init();
    this.createTone({
      frequency: 210,
      endFrequency: 420,
      duration: 0.22,
      type: 'sine',
      volume: 0.1,
    });
    this.noiseSweep(0.18, 900, 1800, 0.035);
  }

  land() {
    this.init();
    this.createTone({
      frequency: 145,
      endFrequency: 55,
      duration: 0.18,
      type: 'sine',
      volume: 0.18,
    });
    this.noiseSweep(0.1, 320, 180, 0.05);
  }

  splash() {
    this.init();
    this.noiseSweep(0.24, 1500, 600, 0.07);
  }

  footstep(water = false) {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (now - this.stepTimer < 0.24) return;
    this.stepTimer = now;
    this.noiseSweep(water ? 0.16 : 0.07, water ? 1100 : 500, water ? 500 : 250, water ? 0.05 : 0.021);
  }

  noiseSweep(duration, startFrequency, endFrequency, volume) {
    if (!this.context) return;
    const length = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    const now = this.context.currentTime;
    filter.frequency.setValueAtTime(startFrequency, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFrequency), now + duration);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.context.currentTime, 0.04);
    }
    return this.muted;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.context.currentTime, 0.04);
    }
  }

  victory() {
    this.init();
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((frequency, index) => {
      this.createTone({
        frequency,
        duration: 0.5,
        type: 'triangle',
        volume: 0.1,
        delay: index * 0.11,
      });
    });
  }
}

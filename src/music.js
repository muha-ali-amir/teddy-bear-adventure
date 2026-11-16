const BPM = 88;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const LOOKAHEAD = 6;

const CHORDS = {
  G: {
    bass: 98.0,
    fifth: 146.83,
    banjo: [196.0, 246.94, 293.66, 392.0],
    guitar: [196.0, 246.94, 293.66],
  },
  C: {
    bass: 130.81,
    fifth: 196.0,
    banjo: [261.63, 329.63, 392.0, 523.25],
    guitar: [261.63, 329.63, 392.0],
  },
  D: {
    bass: 146.83,
    fifth: 220.0,
    banjo: [293.66, 369.99, 440.0, 587.33],
    guitar: [293.66, 369.99, 440.0],
  },
  Em: {
    bass: 164.81,
    fifth: 246.94,
    banjo: [329.63, 392.0, 493.88, 659.25],
    guitar: [329.63, 392.0, 493.88],
  },
};

const PROGRESSION = ['G', 'G', 'C', 'G', 'D', 'C', 'G', 'D'];

const ROLLS = [
  [0, 1, 2, 3, 2, 1, 0, 2],
  [0, 2, 1, 3, 1, 2, 3, 1],
  [0, 1, 2, 1, 3, 2, 1, 0],
];

// A soft counter-melody in G major, played on every other pass through the form.
const MELODY = [
  [{ frequency: 493.88, beat: 0, length: 2 }, { frequency: 392.0, beat: 2, length: 2 }],
  [{ frequency: 440.0, beat: 0, length: 2 }, { frequency: 493.88, beat: 2, length: 2 }],
  [{ frequency: 523.25, beat: 0, length: 2 }, { frequency: 392.0, beat: 2, length: 2 }],
  [{ frequency: 440.0, beat: 0, length: 3 }],
  [{ frequency: 369.99, beat: 0, length: 2 }, { frequency: 440.0, beat: 2, length: 2 }],
  [{ frequency: 392.0, beat: 0, length: 2 }, { frequency: 329.63, beat: 2, length: 2 }],
  [{ frequency: 293.66, beat: 0, length: 2 }, { frequency: 392.0, beat: 2, length: 2 }],
  [{ frequency: 440.0, beat: 0, length: 1.5 }, { frequency: 369.99, beat: 2, length: 2 }],
];

const PLUCK_SETTINGS = {
  banjo: { duration: 0.85, damping: 0.997, brightness: 0.85 },
  guitar: { duration: 1.25, damping: 0.998, brightness: 0.5 },
  bass: { duration: 1.35, damping: 0.999, brightness: 0.22 },
};

function jitter(amount) {
  return (Math.random() - 0.5) * amount;
}

function createReverb(context, destination) {
  const duration = 2.1;
  const sampleRate = context.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.4);
    }
  }

  const convolver = context.createConvolver();
  convolver.buffer = impulse;
  const wet = context.createGain();
  wet.gain.value = 0.22;
  convolver.connect(wet);
  wet.connect(destination);
  return convolver;
}

function createInstrumentBus(context, destination, { volume, pan = 0, filters }) {
  const input = context.createGain();
  input.gain.value = volume;
  let node = input;

  for (const config of filters) {
    const filter = context.createBiquadFilter();
    filter.type = config.type;
    filter.frequency.value = config.frequency;
    filter.Q.value = config.q ?? 0.6;
    node.connect(filter);
    node = filter;
  }

  const panner = context.createStereoPanner();
  panner.pan.value = pan;
  node.connect(panner);
  panner.connect(destination);
  return input;
}

// Karplus-Strong plucked-string synthesis, cached per instrument and pitch.
function createPluckBuffer(context, frequency, { duration, damping, brightness }) {
  const sampleRate = context.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const delay = Math.max(2, Math.round(sampleRate / frequency));
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  let smoothed = 0;
  for (let i = 0; i < delay; i += 1) {
    const white = Math.random() * 2 - 1;
    smoothed = smoothed * (1 - brightness) + white * brightness;
    data[i] = smoothed;
  }

  let mean = 0;
  for (let i = 0; i < delay; i += 1) mean += data[i];
  mean /= delay;

  let peak = 0;
  for (let i = 0; i < delay; i += 1) {
    data[i] -= mean;
    peak = Math.max(peak, Math.abs(data[i]));
  }
  const scale = peak > 0 ? 0.8 / peak : 0;
  for (let i = 0; i < delay; i += 1) data[i] *= scale;

  for (let i = delay; i < length; i += 1) {
    const previous = i - delay - 1 >= 0 ? data[i - delay - 1] : 0;
    data[i] = (data[i - delay] + previous) * 0.5 * damping;
  }

  const fadeIn = Math.min(delay, Math.floor(sampleRate * 0.004));
  for (let i = 0; i < fadeIn; i += 1) data[i] *= i / fadeIn;

  const fadeOut = Math.floor(sampleRate * 0.12);
  for (let i = 0; i < fadeOut; i += 1) {
    const index = length - 1 - i;
    if (index >= 0) data[index] *= i / fadeOut;
  }

  return buffer;
}

export function createBluegrassMusic(context, destination) {
  const musicBus = context.createGain();
  musicBus.gain.setValueAtTime(0, context.currentTime);
  musicBus.gain.linearRampToValueAtTime(1.35, context.currentTime + 3);

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 24;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.28;
  musicBus.connect(compressor);
  compressor.connect(destination);

  const reverb = createReverb(context, destination);
  compressor.connect(reverb);

  const instrumentBuses = {
    banjo: createInstrumentBus(context, musicBus, {
      volume: 0.9,
      pan: -0.26,
      filters: [
        { type: 'highpass', frequency: 170 },
        { type: 'lowpass', frequency: 6800 },
      ],
    }),
    guitar: createInstrumentBus(context, musicBus, {
      volume: 0.85,
      pan: 0.28,
      filters: [{ type: 'lowpass', frequency: 2800 }],
    }),
    bass: createInstrumentBus(context, musicBus, {
      volume: 1,
      pan: 0,
      filters: [{ type: 'lowpass', frequency: 720 }],
    }),
    fiddle: createInstrumentBus(context, musicBus, {
      volume: 0.8,
      pan: -0.1,
      filters: [{ type: 'lowpass', frequency: 2100 }],
    }),
  };

  const pluckBuffers = new Map();
  let bar = 0;
  let loop = 0;
  let nextTime = context.currentTime + 0.4;
  let timer = null;

  function getPluckBuffer(instrument, frequency) {
    const key = `${instrument}:${frequency.toFixed(2)}`;
    if (pluckBuffers.has(key)) return pluckBuffers.get(key);
    const settings = PLUCK_SETTINGS[instrument];
    if (!settings) return null;
    const buffer = createPluckBuffer(context, frequency, settings);
    pluckBuffers.set(key, buffer);
    return buffer;
  }

  function playPluck(instrument, frequency, when, volume) {
    const buffer = getPluckBuffer(instrument, frequency);
    if (!buffer) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(instrumentBuses[instrument]);
    source.start(when);
    source.stop(when + buffer.duration + 0.02);
  }

  function playFiddle(frequency, when, duration, volume) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const vibrato = context.createOscillator();
    const vibratoGain = context.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;

    vibrato.type = 'sine';
    vibrato.frequency.value = 4.7;
    vibratoGain.gain.value = 4.5;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(oscillator.detune);

    filter.type = 'lowpass';
    filter.frequency.value = 1700;
    filter.Q.value = 0.4;

    const attack = 0.09;
    const release = 0.35;
    const sustainStart = when + Math.max(attack, duration - release);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + attack);
    gain.gain.setValueAtTime(volume, sustainStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(instrumentBuses.fiddle);

    oscillator.start(when);
    vibrato.start(when);
    oscillator.stop(when + duration + 0.02);
    vibrato.stop(when + duration + 0.02);
  }

  function scheduleBar(barIndex, loopIndex, startTime) {
    const chord = CHORDS[PROGRESSION[barIndex]];
    const roll = ROLLS[(barIndex + loopIndex) % ROLLS.length];

    for (let step = 0; step < 8; step += 1) {
      const accent = step % 4 === 0 ? 1 : step % 2 === 0 ? 0.82 : 0.68;
      const note = chord.banjo[roll[step]];
      playPluck(
        'banjo',
        note,
        startTime + step * (BEAT / 2) + jitter(0.012),
        0.095 * accent * (0.92 + Math.random() * 0.16),
      );
    }

    for (const offset of [BEAT, BEAT * 3]) {
      chord.guitar.forEach((note, index) => {
        playPluck(
          'guitar',
          note,
          startTime + offset + index * 0.018 + jitter(0.005),
          0.05 * (0.9 + Math.random() * 0.2),
        );
      });
    }

    playPluck('bass', chord.bass, startTime + jitter(0.006), 0.17);
    playPluck('bass', chord.fifth, startTime + BEAT * 2 + jitter(0.006), 0.14);

    if (loopIndex % 2 === 0) {
      for (const note of MELODY[barIndex]) {
        playFiddle(
          note.frequency,
          startTime + note.beat * BEAT + jitter(0.006),
          note.length * BEAT,
          0.036,
        );
      }
    }
  }

  function pump() {
    const horizon = context.currentTime + LOOKAHEAD;
    while (nextTime < horizon) {
      scheduleBar(bar, loop, nextTime);
      nextTime += BAR;
      bar += 1;
      if (bar >= PROGRESSION.length) {
        bar = 0;
        loop += 1;
      }
    }
  }

  function start() {
    if (timer) return;
    timer = window.setInterval(pump, 200);
    pump();
  }

  function stop() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function setVolume(value) {
    musicBus.gain.setTargetAtTime(value, context.currentTime, 0.08);
  }

  start();

  return {
    musicBus,
    pluckBuffers,
    start,
    stop,
    setVolume,
    get bar() {
      return bar;
    },
    get loop() {
      return loop;
    },
  };
}

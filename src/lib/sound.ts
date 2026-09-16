// Tiny procedural sound effects via Web Audio — no asset files to fetch or
// host, works fully offline in the installed PWA. A single shared
// AudioContext is created lazily on first use (browsers block audio until a
// user gesture, and dragging a piece already counts as one).

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) ctx = new AudioCtx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(
  freq: number,
  startTime: number,
  duration: number,
  peakGain: number,
  type: OscillatorType = 'sine'
) {
  const audio = getContext();
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

export function playPlace() {
  const audio = getContext();
  if (!audio) return;
  tone(320, audio.currentTime, 0.07, 0.12, 'triangle');
}

/** Pitch, duration and volume all scale with how many lines cleared at
 * once, so a double/triple/mega clear feels distinctly bigger than a single. */
export function playClear(linesCleared: number) {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5 E5 G5 C6 E6
  const count = Math.min(2 + linesCleared, notes.length);
  for (let i = 0; i < count; i++) {
    tone(notes[i], now + i * 0.05, 0.22, 0.14 + linesCleared * 0.02, 'sine');
  }
}

export function playGameOver() {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  [392, 329.63, 261.63].forEach((freq, i) => {
    tone(freq, now + i * 0.14, 0.3, 0.12, 'triangle');
  });
}

/** The audio clock, in seconds. Anything that has to stay in time — Simon's
 * sequence above all — must be scheduled against this rather than against
 * setTimeout, whose drift is plainly audible within a handful of steps. */
export function audioNow(): number | null {
  const audio = getContext();
  return audio ? audio.currentTime : null;
}

/** Browsers refuse to start audio outside a user gesture. Call this from
 * the tap that begins a game so the first tone isn't swallowed. */
export function unlockAudio(): void {
  getContext();
}

/** The four Simon pitches, in pad order (green, red, yellow, blue). These
 * are the tones the original Milton Bradley unit produced — an A-flat major
 * chord with the blue pad an octave down, which is what makes the low pad
 * so distinctive. Getting these wrong is instantly noticeable to anyone who
 * grew up with one. */
export const SIMON_TONES = [415.3, 310.0, 252.0, 209.0];

/** Schedules one pad tone at an exact point on the audio clock. A square
 * wave rolled off slightly is closer to the original's buzzy speaker than a
 * pure sine. */
export function scheduleSimonTone(
  pad: number,
  at: number,
  duration: number
): void {
  const audio = getContext();
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const filter = audio.createBiquadFilter();
  osc.type = 'square';
  osc.frequency.setValueAtTime(SIMON_TONES[pad] ?? SIMON_TONES[0], at);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, at);
  // Short attack and release, but a flat sustain in between — a percussive
  // decay would make a long tone sound like a short one and ruin the sense
  // of the sequence speeding up.
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.16, at + 0.012);
  gain.gain.setValueAtTime(0.16, at + Math.max(duration - 0.03, 0.02));
  gain.gain.linearRampToValueAtTime(0, at + duration);
  osc.connect(filter).connect(gain).connect(audio.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** A pad tone that sounds for as long as the player holds the pad. Returns
 * a stop function; calling it releases the note. */
export function startSimonTone(pad: number): () => void {
  const audio = getContext();
  if (!audio) return () => {};
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const filter = audio.createBiquadFilter();
  osc.type = 'square';
  osc.frequency.setValueAtTime(SIMON_TONES[pad] ?? SIMON_TONES[0], now);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.16, now + 0.012);
  osc.connect(filter).connect(gain).connect(audio.destination);
  osc.start(now);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const end = audio.currentTime;
    gain.gain.cancelScheduledValues(end);
    gain.gain.setValueAtTime(gain.gain.value, end);
    gain.gain.linearRampToValueAtTime(0, end + 0.04);
    osc.stop(end + 0.06);
  };
}

/** The raspberry a wrong pad earns: the original's low, detuned honk. */
export function playSimonFail(): void {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(110, now);
  osc.frequency.exponentialRampToValueAtTime(42, now + 1.1);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
  gain.gain.setValueAtTime(0.18, now + 0.9);
  gain.gain.linearRampToValueAtTime(0, now + 1.15);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + 1.2);
}

/** A card landing on a pile, or a tube of liquid glugging into another. */
export function playPour(): void {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  tone(180, now, 0.09, 0.08, 'sine');
  tone(240, now + 0.04, 0.1, 0.06, 'sine');
}

/** A short rising flourish for finishing something — a solved level, a
 * completed foundation. */
export function playWin(): void {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    tone(freq, now + i * 0.09, 0.3, 0.13, 'triangle');
  });
}

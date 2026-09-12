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

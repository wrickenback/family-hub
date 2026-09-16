/** Simon: watch a growing sequence of coloured, pitched flashes and repeat
 * it. The engine here is only the sequence and — much more importantly —
 * the timing, which is what separates a Simon that feels right from one
 * that feels like a slideshow. */

export interface Pad {
  id: number;
  name: string;
  /** Face colour when idle, and when lit. The lit state has to be a real
   * jump in brightness: on a sunlit phone screen a subtle glow is invisible
   * and the game becomes unplayable without sound. */
  color: string;
  litColor: string;
}

export const PADS: Pad[] = [
  { id: 0, name: 'Green', color: '#1f7a45', litColor: '#5dffa0' },
  { id: 1, name: 'Red', color: '#a51f26', litColor: '#ff6b73' },
  { id: 2, name: 'Yellow', color: '#b08a12', litColor: '#ffe066' },
  { id: 3, name: 'Blue', color: '#1d4e9c', litColor: '#6fb1ff' },
];

/** The original speeds up in three fixed tiers rather than smoothly, and
 * that stepped jump is a big part of the tension — you notice the moment it
 * gets faster. Durations are in seconds, matched to the Milton Bradley
 * unit: a little over four tenths of a second early on, down to just over
 * two tenths once the sequence is long.
 *
 * The gap is deliberately short relative to the tone. Long gaps let a
 * player count the sequence out at leisure; the original does not. */
export function stepTiming(sequenceLength: number): {
  tone: number;
  gap: number;
} {
  const tone = sequenceLength <= 5 ? 0.42 : sequenceLength <= 13 ? 0.32 : 0.22;
  return { tone, gap: Math.max(tone * 0.45, 0.08) };
}

/** Where each step of a sequence starts, relative to the start of playback.
 * Precomputing the whole schedule up front is what lets both the tones and
 * the flashes be driven off the audio clock — anything that chains one
 * setTimeout off the last accumulates drift, and by ten steps in it is
 * audibly out of time. */
export function playbackSchedule(
  sequence: number[]
): { pad: number; at: number; duration: number }[] {
  const { tone, gap } = stepTiming(sequence.length);
  return sequence.map((pad, i) => ({
    pad,
    at: i * (tone + gap),
    duration: tone,
  }));
}

export function playbackDuration(sequence: number[]): number {
  const { tone, gap } = stepTiming(sequence.length);
  return sequence.length * (tone + gap);
}

/** Adds one step. Repeats are allowed — the real thing repeats too, and a
 * doubled colour is one of the harder things to hear. */
export function extendSequence(sequence: number[]): number[] {
  return [...sequence, Math.floor(Math.random() * PADS.length)];
}

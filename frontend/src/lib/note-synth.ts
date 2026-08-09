import type { TabNote } from "@/lib/api";

const SAMPLE_RATE = 44100;

function midiToFreq(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

export async function synthesizeNotes(
  notes: TabNote[],
  duration: number
): Promise<AudioBuffer> {
  const totalSamples = Math.ceil(SAMPLE_RATE * duration) + SAMPLE_RATE * 0.05;
  const offlineCtx = new OfflineAudioContext(1, totalSamples, SAMPLE_RATE);

  for (const note of notes) {
    const startTime = note.start_time;
    const noteDuration = Math.max(0.02, note.end_time - note.start_time);
    const freq = midiToFreq(note.pitch);
    if (freq < 20 || freq > 8000) continue;

    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();

    osc.type = "triangle";
    osc.frequency.value = freq;

    const attack = Math.min(0.01, noteDuration * 0.1);
    const release = Math.min(0.05, noteDuration * 0.3);
    const sustainGain = 0.22;
    const vel = (note.velocity || 80) / 127;
    const amp = sustainGain * vel;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(amp, startTime + attack);
    gain.gain.setValueAtTime(amp, startTime + noteDuration - release);
    gain.gain.linearRampToValueAtTime(0, startTime + noteDuration);

    osc.connect(gain);
    gain.connect(offlineCtx.destination);
    osc.start(startTime);
    osc.stop(startTime + noteDuration + 0.005);
  }

  const rendered = await offlineCtx.startRendering();
  return rendered;
}

export function getNotesAtTime(notes: TabNote[], time: number): TabNote[] {
  return notes.filter((n) => time >= n.start_time && time <= n.end_time);
}

declare module "soundtouchjs" {
  export class AbstractFifoSamplePipe {
    // base class, not used directly
  }

  export class SimpleFilter {
    constructor(
      source: WebAudioBufferSource,
      pipe: SoundTouch,
      onEnd?: () => void
    );
    sourcePosition: number;
    extract(target: Float32Array, numFrames: number): number;
  }

  export class SoundTouch {
    tempo: number;
    rate: number;
    pitch: number;
    pitchSemitones: number;
    putSource(samples: Float32Array): void;
    getProcessedSamples(): Float32Array;
  }

  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
    buffer: AudioBuffer;
    position: number;
    extract(target: Float32Array, numFrames?: number, position?: number): number;
  }

  export class PitchShifter {
    constructor(
      context: AudioContext,
      buffer: AudioBuffer,
      bufferSize?: number,
      onEnd?: () => void
    );

    tempo: number;
    rate: number;
    pitch: number;
    pitchSemitones: number;
    duration: number;
    timePlayed: number;
    percentagePlayed: number;

    node: ScriptProcessorNode;

    connect(toNode: AudioNode): void;
    disconnect(): void;
    on(eventName: string, cb: (...args: unknown[]) => void): void;
    off(eventName: string, cb: (...args: unknown[]) => void): void;
  }

  export class RateTransposer extends AbstractFifoSamplePipe {
    rate: number;
  }

  export class Stretch extends AbstractFifoSamplePipe {
    tempo: number;
  }

  export function getWebAudioNode(
    context: AudioContext,
    filter: SimpleFilter,
    sourcePositionCallback?: (pos: number) => void,
    bufferSize?: number
  ): ScriptProcessorNode;
}

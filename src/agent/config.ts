export interface DurationRange {
  minMs: number;
  maxMs: number;
}

export interface MockTiming {
  queuedMs: number;
  analysisMs: DurationRange;
  toolUseMs: DurationRange;
  toolResultMs: DurationRange;
  imageMs: DurationRange;
  composingMs: DurationRange;
  calculatorComposingMs: DurationRange;
}

export interface StreamingConfig {
  wordsPerSecond: number;
  variance: number;
  minBlockMs: number;
  headingWordsPerSecond: number;
  minHeadingMs: number;
  maxHeadingMs: number;
  minChunkSize: number;
  maxChunkSize: number;
  paragraphPauseMs: DurationRange;
  listPauseMs: DurationRange;
}

export const MOCK_TIMING: Readonly<MockTiming> = {
  queuedMs: 150,
  analysisMs: { minMs: 300, maxMs: 600 },
  toolUseMs: { minMs: 150, maxMs: 300 },
  toolResultMs: { minMs: 100, maxMs: 200 },
  imageMs: { minMs: 2500, maxMs: 3500 },
  composingMs: { minMs: 200, maxMs: 400 },
  calculatorComposingMs: { minMs: 100, maxMs: 200 },
};

export const STREAMING_CONFIG: Readonly<StreamingConfig> = {
  wordsPerSecond: 80,
  variance: 0.1,
  minBlockMs: 80,
  headingWordsPerSecond: 100,
  minHeadingMs: 60,
  maxHeadingMs: 150,
  minChunkSize: 8,
  maxChunkSize: 24,
  paragraphPauseMs: { minMs: 100, maxMs: 150 },
  listPauseMs: { minMs: 60, maxMs: 100 },
};

export function randomInteger(min: number, max: number, random: () => number) {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min)
    throw new RangeError('Invalid random range');
  if (min === max) return min;
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw new RangeError('Random source must return a value in [0, 1)');
  return min + Math.floor(value * (max - min + 1));
}

export const sampleDuration = (range: DurationRange, random: () => number) =>
  randomInteger(range.minMs, range.maxMs, random);
export const NEWTON_IMAGE_SRC = 'assets/newtons-2nd-law-of-motion.png';

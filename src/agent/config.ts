export const MOCK_TIMING = {
  queuedMs: 150,
  processingMs: 450,
  calculatorMs: 500,
  imageMs: 800,
  composingMs: 200,
  chunkMs: 50,
} as const;

export type MockTiming = { [Key in keyof typeof MOCK_TIMING]: number };
export const STREAM_CHUNK_SIZE = 16;
export const ARCHIMEDES_IMAGE_SRC =
  'assets/Archimedes’ Principle Infographic (1).png';

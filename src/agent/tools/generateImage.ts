import { delay } from '@/shared/delay';
import { MOCK_TIMING, NEWTON_IMAGE_SRC } from '../config';

export interface GenerateImageInput {
  topic: 'newton';
  imageType: 'educational_diagram';
}

export interface GenerateImageResult {
  status: 'success';
  imageSrc: string;
  alt: string;
}

export const NEWTON_IMAGE_ALT =
  'Второй закон Ньютона: сила и ускорение направлены одинаково; a = F / m. При той же массе удвоение силы удваивает ускорение, при той же силе удвоение массы уменьшает его вдвое.';

export function isGenerateImageInput(
  value: unknown,
): value is GenerateImageInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    'topic' in value &&
    value.topic === 'newton' &&
    'imageType' in value &&
    value.imageType === 'educational_diagram'
  );
}

export function isGenerateImageResult(
  value: unknown,
): value is GenerateImageResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    value.status === 'success' &&
    'imageSrc' in value &&
    value.imageSrc === NEWTON_IMAGE_SRC &&
    'alt' in value &&
    typeof value.alt === 'string' &&
    value.alt.trim().length > 0
  );
}

export async function generateImage(
  input: GenerateImageInput,
  signal: AbortSignal,
  {
    delayMs = MOCK_TIMING.imageMs.minMs,
    fail = false,
  }: { delayMs?: number; fail?: boolean } = {},
): Promise<GenerateImageResult> {
  if (!isGenerateImageInput(input))
    throw new RangeError('Unsupported image request');
  await delay(delayMs, signal);
  signal.throwIfAborted();
  if (fail) throw new Error('Mock image generation failed');
  return {
    status: 'success',
    imageSrc: NEWTON_IMAGE_SRC,
    alt: NEWTON_IMAGE_ALT,
  };
}

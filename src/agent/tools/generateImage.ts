import { delay } from '@/shared/delay';
import en from '@/locales/en.json';
import { getDictionary } from '@/app/i18n';
import type { Language } from '@/shared/language';
import {
  getNewtonImageSrc,
  MOCK_TIMING,
  NEWTON_IMAGE_SRC_EN,
  NEWTON_IMAGE_SRC_RU,
} from '../config';

export interface GenerateImageInput {
  topic: 'newton';
  imageType: 'educational_diagram';
}

export interface GenerateImageResult {
  status: 'success';
  imageSrc: string;
  alt: string;
}

export const NEWTON_IMAGE_ALT = en.agent.newton.imageAlt;
export const NEWTON_IMAGE_ALT_RU = getDictionary('ru').agent.newton.imageAlt;

// This demo tool does not generate a bitmap or make a network request. After an
// abortable delay, it returns a local asset for the UI to display.
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
    (value.imageSrc === NEWTON_IMAGE_SRC_EN ||
      value.imageSrc === NEWTON_IMAGE_SRC_RU ||
      value.imageSrc === 'assets/newtons-2nd-law-of-motion.png') &&
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
    language = 'en',
  }: { delayMs?: number; fail?: boolean; language?: Language } = {},
): Promise<GenerateImageResult> {
  if (!isGenerateImageInput(input))
    throw new RangeError('Unsupported image request');
  await delay(delayMs, signal);
  signal.throwIfAborted();
  if (fail) throw new Error('Mock image generation failed');
  return {
    status: 'success',
    imageSrc: getNewtonImageSrc(language),
    alt: getDictionary(language).agent.newton.imageAlt,
  };
}

import { afterEach, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import {
  generateImage,
  isGenerateImageInput,
  isGenerateImageResult,
  NEWTON_IMAGE_ALT,
} from './generateImage';
import { NEWTON_IMAGE_SRC } from '../config';
const input = { topic: 'newton', imageType: 'educational_diagram' } as const;
afterEach(() => vi.useRealTimers());

it('returns the supplied PNG and alt only after the configured preparation', async () => {
  vi.useFakeTimers();
  const pending = generateImage(input, new AbortController().signal, {
    delayMs: 800,
  });
  const settled = vi.fn();
  void pending.then(settled);
  await vi.advanceTimersByTimeAsync(799);
  expect(settled).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  const result = await pending;
  expect(result).toEqual({
    status: 'success',
    imageSrc: NEWTON_IMAGE_SRC,
    alt: NEWTON_IMAGE_ALT,
  });
  expect(
    existsSync(new URL(`../../../public/${result.imageSrc}`, import.meta.url)),
  ).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it('fails deterministically without returning a result', async () => {
  vi.useFakeTimers();
  const pending = generateImage(input, new AbortController().signal, {
    delayMs: 100,
    fail: true,
  });
  const rejected = expect(pending).rejects.toThrow(
    'Mock image generation failed',
  );
  await vi.runAllTimersAsync();
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});
it('cancels preparation and releases its delay', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const pending = generateImage(input, controller.signal, { delayMs: 2000 });
  const rejected = expect(pending).rejects.toMatchObject({
    name: 'AbortError',
  });
  await vi.advanceTimersByTimeAsync(100);
  controller.abort();
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});
it.each([
  null,
  {},
  { topic: 'other', imageType: 'educational_diagram' },
  { topic: 'newton', imageType: 'photo' },
])('rejects unsupported input %#', async (value) => {
  expect(isGenerateImageInput(value)).toBe(false);
});
it.each([
  {
    status: 'success',
    imageSrc: 'https://example.com/image.png',
    alt: 'image',
  },
  { status: 'success', imageSrc: NEWTON_IMAGE_SRC, alt: ' ' },
  { status: 'failed', imageSrc: NEWTON_IMAGE_SRC, alt: 'image' },
])('rejects invalid output %#', (value) =>
  expect(isGenerateImageResult(value)).toBe(false),
);

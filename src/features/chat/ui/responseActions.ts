import { delay } from '@/shared/delay';
import { localImageUrl } from './contentPolicy';

export async function copyResponseText(text: string) {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
  await navigator.clipboard.writeText(text);
}

export async function downloadResponseImage(
  imageSrc: string,
  base: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const src = localImageUrl(imageSrc, base);
  if (!src) throw new Error('Invalid image source');
  const response = await fetch(src, { signal });
  if (!response.ok) throw new Error('Image request failed');
  const blob = await response.blob();
  signal.throwIfAborted();
  if (blob.type !== 'image/png' || blob.size === 0)
    throw new Error('Invalid image response');
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  try {
    link.href = url;
    link.download = 'lom-ai-newton.png';
    document.body.append(link);
    link.click();
    // Give the browser time to take ownership before releasing the temporary URL.
    await delay(1000, signal);
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

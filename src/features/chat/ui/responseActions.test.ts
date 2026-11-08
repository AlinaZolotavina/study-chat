import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { copyResponseText, downloadResponseImage } from './responseActions';

const imageSrc = 'assets/newtons-2nd-law-of-motion.png';
const png = new Blob(['original PNG bytes'], { type: 'image/png' });
let link: {
  href: string;
  download: string;
  click: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};
let fetchImage: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  vi.useFakeTimers();
  link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  vi.stubGlobal('document', {
    createElement: vi.fn(() => link),
    body: { append: vi.fn() },
  });
  fetchImage = vi.fn<typeof fetch>().mockResolvedValue(new Response(png));
  vi.stubGlobal('fetch', fetchImage);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('copies the complete raw Markdown without reformatting it', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const text = '**Второй закон Ньютона**\n\n- F = m · a\n- `код` 🙂';
  await copyResponseText(text);
  expect(writeText).toHaveBeenCalledExactlyOnceWith(text);
});
it('propagates clipboard refusal instead of reporting success', async () => {
  const refusal = new Error('Permission denied');
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn().mockRejectedValue(refusal) },
  });
  await expect(copyResponseText('text')).rejects.toBe(refusal);
});
it('handles an unavailable Clipboard API', async () => {
  vi.stubGlobal('navigator', {});
  await expect(copyResponseText('text')).rejects.toThrow(
    'Clipboard unavailable',
  );
});

it('downloads the original PNG with the deployment base and releases the link and URL', async () => {
  const signal = new AbortController().signal;
  const pending = downloadResponseImage(imageSrc, '/study-chat/', signal);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchImage).toHaveBeenCalledExactlyOnceWith(
    '/study-chat/assets/newtons-2nd-law-of-motion.png',
    { signal },
  );
  expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  const downloaded = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0];
  expect(downloaded).toBeInstanceOf(Blob);
  if (!(downloaded instanceof Blob)) throw new Error('Expected a PNG Blob');
  expect(await downloaded.arrayBuffer()).toEqual(await png.arrayBuffer());
  expect(link.href).toBe('blob:download');
  expect(link.download).toBe('lom-ai-newton.png');
  expect(link.click).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  await pending;
  expect(link.remove).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:download');
  expect(vi.getTimerCount()).toBe(0);
});

it('does not fetch a source rejected by the image URL policy', async () => {
  await expect(
    downloadResponseImage(
      'https://example.com/a.png',
      '/',
      new AbortController().signal,
    ),
  ).rejects.toThrow('Invalid image source');
  expect(fetchImage).not.toHaveBeenCalled();
});
it.each([
  new Response('Missing', { status: 404 }),
  new Response('Not an image', { headers: { 'Content-Type': 'text/html' } }),
  new Response(new Blob([], { type: 'image/png' })),
])(
  'does not initiate a download for an invalid server response %#',
  async (response) => {
    fetchImage.mockResolvedValue(response);
    await expect(
      downloadResponseImage(imageSrc, '/', new AbortController().signal),
    ).rejects.toThrow();
    expect(link.click).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  },
);
it('handles network failure without allocating a URL', async () => {
  fetchImage.mockRejectedValue(new Error('Network failed'));
  await expect(
    downloadResponseImage(imageSrc, '/', new AbortController().signal),
  ).rejects.toThrow('Network failed');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('does not fetch when its operation was already cancelled', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    downloadResponseImage(imageSrc, '/', controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchImage).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('releases resources even when initiating the download throws', async () => {
  link.click.mockImplementation(() => {
    throw new Error('Blocked');
  });
  await expect(
    downloadResponseImage(imageSrc, '/', new AbortController().signal),
  ).rejects.toThrow('Blocked');
  expect(link.remove).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:download');
});
it('cancels the URL retention delay and releases resources on disposal', async () => {
  const controller = new AbortController();
  const pending = downloadResponseImage(imageSrc, '/', controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({
    name: 'AbortError',
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(link.click).toHaveBeenCalledOnce();
  controller.abort();
  await rejected;
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:download');
  expect(link.remove).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('ignores a late fetch result after cancellation, even if fetch ignores the signal', async () => {
  let resolve: ((response: Response) => void) | undefined;
  fetchImage.mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const controller = new AbortController();
  const pending = downloadResponseImage(imageSrc, '/', controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({
    name: 'AbortError',
  });
  controller.abort();
  resolve?.(new Response(png));
  await rejected;
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(link.click).not.toHaveBeenCalled();
});

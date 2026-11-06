import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { delay } from './delay';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('resolves only after its duration and removes its abort listener', async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const resolved = vi.fn();
  const pending = delay(100, controller.signal).then(resolved);
  await vi.advanceTimersByTimeAsync(99);
  expect(resolved).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(resolved).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});

it('rejects and clears resources immediately on abort', async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const rejected = expect(delay(100, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  controller.abort();
  await rejected;
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});

it('does not allocate a timer or listener for an already aborted signal', async () => {
  const controller = new AbortController();
  controller.abort();
  const add = vi.spyOn(controller.signal, 'addEventListener');
  await expect(delay(100, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(add).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

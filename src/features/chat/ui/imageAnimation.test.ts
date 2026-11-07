import { expect, it } from 'vitest';
import {
  imageAnimationReducer as reduce,
  initialImageAnimation,
} from './imageAnimation';

it('keeps an early loaded result hidden until both particle stages finish', () => {
  let state = reduce(initialImageAnimation(true), { type: 'start' });
  expect(state.phase).toBe('blur');
  state = reduce(state, { type: 'loaded' });
  expect(state.phase).toBe('blur');
  state = reduce(state, { type: 'ended', phase: 'blur' });
  expect(state.phase).toBe('particles');
  state = reduce(state, { type: 'ended', phase: 'particles' });
  expect(state.phase).toBe('fading');
  expect(state.pixelsGone).toBe(false);
  state = reduce(state, { type: 'ended', phase: 'fading' });
  expect(state).toMatchObject({ phase: 'revealing', pixelsGone: true });
  state = reduce(state, { type: 'ended', phase: 'revealing' });
  expect(state.phase).toBe('ready');
});
it('waits after the pixels disappear and reveals only when the file loads', () => {
  let state = reduce(initialImageAnimation(true), { type: 'start' });
  for (const phase of ['blur', 'particles', 'fading'] as const)
    state = reduce(state, { type: 'ended', phase });
  expect(state).toEqual({ phase: 'fading', pixelsGone: true, loaded: false });
  expect(reduce(state, { type: 'ended', phase: 'fading' })).toBe(state);
  expect(reduce(state, { type: 'loaded' })).toEqual({
    phase: 'revealing',
    pixelsGone: true,
    loaded: true,
  });
});
it('ignores duplicate start and out-of-order animation events', () => {
  const state = reduce(initialImageAnimation(true), { type: 'start' });
  expect(reduce(state, { type: 'start' })).toBe(state);
  expect(reduce(state, { type: 'ended', phase: 'fading' })).toBe(state);
  expect(reduce(state, { type: 'ended', phase: 'revealing' })).toBe(state);
});
it('shows restored, background and reduced-motion images statically after load', () => {
  const state = initialImageAnimation(false);
  expect(reduce(state, { type: 'start' })).toBe(state);
  expect(reduce(state, { type: 'loaded' })).toEqual({
    phase: 'ready',
    loaded: true,
    pixelsGone: false,
  });
});
it.each(['blur', 'particles', 'fading', 'revealing'] as const)(
  'skips %s without replaying on late events',
  (phase) => {
    const state = reduce(
      { phase, loaded: true, pixelsGone: false },
      { type: 'skip' },
    );
    expect(state).toMatchObject({ phase: 'ready', pixelsGone: true });
    expect(reduce(state, { type: 'ended', phase })).toBe(state);
  },
);

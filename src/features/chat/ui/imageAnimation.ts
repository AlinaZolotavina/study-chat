export type ImagePhase =
  'idle' | 'blur' | 'particles' | 'fading' | 'revealing' | 'ready';
export interface ImageAnimationState {
  phase: ImagePhase;
  loaded: boolean;
  pixelsGone: boolean;
}
export type ImageAnimationEvent =
  { type: 'start' | 'loaded' | 'skip' } | { type: 'ended'; phase: ImagePhase };

export const initialImageAnimation = (
  animate: boolean,
): ImageAnimationState => ({
  phase: animate ? 'idle' : 'ready',
  loaded: false,
  pixelsGone: false,
});

export function imageAnimationReducer(
  state: ImageAnimationState,
  event: ImageAnimationEvent,
): ImageAnimationState {
  if (event.type === 'skip')
    return { ...state, phase: 'ready', pixelsGone: true };
  if (event.type === 'start')
    return state.phase === 'idle' ? { ...state, phase: 'blur' } : state;
  if (event.type === 'loaded')
    return {
      ...state,
      loaded: true,
      phase:
        state.phase === 'fading' && state.pixelsGone
          ? 'revealing'
          : state.phase,
    };
  if (event.type !== 'ended' || event.phase !== state.phase) return state;
  switch (state.phase) {
    case 'blur':
      return { ...state, phase: 'particles' };
    case 'particles':
      return { ...state, phase: 'fading' };
    case 'fading':
      return state.pixelsGone
        ? state
        : {
            ...state,
            pixelsGone: true,
            phase: state.loaded ? 'revealing' : 'fading',
          };
    case 'revealing':
      return { ...state, phase: 'ready' };
    default:
      return state;
  }
}

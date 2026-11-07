import {
  useCallback,
  useReducer,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { NEWTON_IMAGE_ALT } from '@/agent/tools/generateImage';
import type { Run } from '../model/types';
import { localImageUrl } from './contentPolicy';
import { imageAnimationReducer, initialImageAnimation } from './imageAnimation';
import styles from './ChatWorkspace.module.css';

const MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const getReducedMotion = () => window.matchMedia(MOTION_QUERY).matches;
const particles = Array.from(
  { length: 14 },
  (_, index) =>
    ({
      left: `${8 + ((index * 23) % 84)}%`,
      top: `${10 + ((index * 37) % 78)}%`,
      width: `${2 + (index % 3)}px`,
      height: `${2 + (index % 3)}px`,
      '--pixel-x': `${(index % 2 ? 1 : -1) * (12 + (index % 5) * 6)}px`,
      '--pixel-y': `${(index % 3 ? -1 : 1) * (10 + (index % 4) * 7)}px`,
    }) satisfies CSSProperties & Record<string, string>,
);

export function MessageImage({
  imageSrc,
  imageAlt,
  run,
}: {
  imageSrc: string | null;
  imageAlt: string | undefined;
  run: Run;
}) {
  const preparing =
    run.status === 'processing' &&
    run.phase.kind === 'using_tool' &&
    run.phase.tool === 'generate_image';
  const visible = !!imageSrc || preparing;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!visible) return () => {};
      const query = window.matchMedia(MOTION_QUERY);
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    [visible],
  );
  const reducedMotion = useSyncExternalStore(subscribe, getReducedMotion);
  const [animation, dispatch] = useReducer(
    imageAnimationReducer,
    !reducedMotion &&
      (run.status === 'queued' ||
        (run.status === 'processing' && run.phase.kind === 'analyzing')),
    initialImageAnimation,
  );
  const [failed, setFailed] = useState(false);
  if (animation.phase === 'idle' && preparing) dispatch({ type: 'start' });
  else if (
    (reducedMotion ||
      (!visible && animation.phase !== 'idle') ||
      (imageSrc && animation.phase === 'idle')) &&
    animation.phase !== 'ready'
  )
    dispatch({ type: 'skip' });
  if (!visible) return null;
  const src = imageSrc && localImageUrl(imageSrc, import.meta.env.BASE_URL);
  const error = failed || (!!imageSrc && !src);
  const ready = animation.phase === 'ready' && animation.loaded;
  const showingPixels =
    (animation.phase === 'particles' || animation.phase === 'fading') &&
    !animation.pixelsGone;
  return (
    <figure className={styles.imageFigure}>
      <div
        className={styles.imageFrame}
        aria-busy={!ready && !error}
        data-image-phase={error ? 'error' : animation.phase}
      >
        {error ? (
          <p role="status" className={styles.imageError}>
            Не удалось загрузить изображение
          </p>
        ) : (
          <>
            {src && (
              <img
                src={src}
                width={1672}
                height={941}
                alt={imageAlt ?? NEWTON_IMAGE_ALT}
                loading="lazy"
                className={`${!ready && animation.phase !== 'revealing' ? styles.imageLoading : ''} ${animation.phase === 'revealing' ? styles.imageReveal : ''}`}
                onLoad={() => dispatch({ type: 'loaded' })}
                onError={() => setFailed(true)}
                onAnimationEnd={(event) => {
                  if (event.target === event.currentTarget)
                    dispatch({ type: 'ended', phase: 'revealing' });
                }}
              />
            )}
            {!ready && animation.phase !== 'revealing' && (
              <div
                className={`${styles.imagePlaceholder} ${animation.phase === 'blur' ? styles.imageBlurStage : ''}`}
                onAnimationEnd={(event) => {
                  if (event.target === event.currentTarget)
                    dispatch({ type: 'ended', phase: 'blur' });
                }}
                role="status"
              >
                {imageSrc && !animation.loaded
                  ? 'Загружаю изображение…'
                  : 'Создаю изображение…'}
              </div>
            )}
            {showingPixels && (
              <div
                className={`${styles.imageParticles} ${animation.phase === 'particles' ? styles.imageParticlesMoving : styles.imageParticlesFading}`}
                aria-hidden="true"
                onAnimationEnd={(event) => {
                  if (event.target === event.currentTarget)
                    dispatch({ type: 'ended', phase: animation.phase });
                }}
              >
                {particles.map((style, index) => (
                  <span
                    key={index}
                    className={styles.imageParticle}
                    style={style}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </figure>
  );
}

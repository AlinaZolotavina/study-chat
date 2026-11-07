import { useId, useLayoutEffect, useState, type RefObject } from 'react';
import { Icon } from '@/shared/Icon';
import { ChatDialog } from './ChatDialog';
import styles from './ChatWorkspace.module.css';

export function ImageViewer({
  src,
  alt,
  opener,
  pending,
  error,
  onDownload,
  onClose,
}: {
  src: string;
  alt: string;
  opener: RefObject<HTMLButtonElement | null>;
  pending: boolean;
  error: boolean;
  onDownload: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => {
    const trigger = opener.current;
    const viewport = trigger?.closest<HTMLElement>('[role="region"]');
    const elements = [
      document.documentElement,
      document.body,
      ...(viewport ? [viewport] : []),
    ];
    const saved = elements.map((element) => ({
      element,
      overflow: element.style.overflow,
      gutter: element.style.scrollbarGutter,
    }));
    const top = viewport?.scrollTop ?? 0;
    const followedBottom = viewport
      ? viewport.scrollHeight - viewport.clientHeight - top <= 80
      : false;
    for (const { element } of saved) {
      element.style.scrollbarGutter = 'stable';
      element.style.overflow = 'hidden';
    }
    return () => {
      for (const { element, overflow, gutter } of saved) {
        element.style.overflow = overflow;
        element.style.scrollbarGutter = gutter;
      }
      if (viewport?.isConnected)
        viewport.scrollTop = followedBottom
          ? viewport.scrollHeight - viewport.clientHeight
          : top;
      requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      });
    };
  }, [opener]);
  return (
    <ChatDialog
      id={`image-viewer-${id}`}
      labelledBy={`image-viewer-title-${id}`}
      className={styles.imageViewer ?? ''}
      onClose={onClose}
    >
      <span id={`image-viewer-title-${id}`} className={styles.visuallyHidden}>
        Изображение схемы
      </span>
      <header className={styles.imageViewerToolbar}>
        <span role="status" className={styles.viewerDownloadStatus}>
          {error ? 'Не удалось скачать изображение' : ''}
        </span>
        <button
          type="button"
          autoFocus
          className={styles.responseActionButton}
          aria-label="Закрыть просмотр изображения"
          title="Закрыть просмотр изображения"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div
        className={styles.imageViewerBody}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {failed ? (
          <p role="status">Не удалось открыть изображение</p>
        ) : (
          <div className={styles.imageViewerCanvas}>
            <img
              src={src}
              alt={alt}
              width={1672}
              height={941}
              onError={() => setFailed(true)}
            />
            <button
              type="button"
              className={`${styles.responseActionButton} ${styles.imageDownloadButton}`}
              aria-label="Скачать изображение"
              title="Скачать изображение"
              aria-busy={pending}
              disabled={pending}
              onClick={onDownload}
            >
              <Icon name="download" />
            </button>
          </div>
        )}
      </div>
    </ChatDialog>
  );
}

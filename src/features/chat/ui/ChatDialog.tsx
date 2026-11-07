import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type Ref,
} from 'react';
import styles from './ChatWorkspace.module.css';

export interface ChatDialogHandle {
  close: (afterClose?: () => void) => void;
}

export function ChatDialog({
  ref: externalRef,
  id,
  labelledBy,
  className,
  onClose,
  animated = false,
  children,
}: {
  ref?: Ref<ChatDialogHandle>;
  id: string;
  labelledBy: string;
  className: string;
  onClose: () => void;
  animated?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  function requestClose(afterClose?: () => void) {
    if (closing.current) return;
    closing.current = true;
    const finish = () => {
      onClose();
      afterClose?.();
    };
    const dialog = ref.current;
    if (
      !animated ||
      !dialog ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      finish();
      return;
    }
    const appearance = getComputedStyle(dialog);
    dialog.style.setProperty('--dialog-exit-opacity', appearance.opacity);
    dialog.style.setProperty('--dialog-exit-transform', appearance.transform);
    dialog.style.setProperty(
      '--dialog-backdrop-exit-opacity',
      getComputedStyle(dialog, '::backdrop').opacity,
    );
    dialog.dataset.closing = 'true';
    const animations = dialog
      .getAnimations({ subtree: true })
      .filter(
        (animation) =>
          animation.effect?.getComputedTiming().endTime !== Infinity,
      );
    void Promise.all(
      animations.map((animation) => animation.finished.catch(() => {})),
    ).then(() => {
      if (ref.current === dialog) finish();
    });
  }

  useImperativeHandle(externalRef, () => ({ close: requestClose }));

  return (
    <dialog
      ref={ref}
      id={id}
      className={`${styles.chatDialog} ${className}`}
      aria-labelledby={labelledBy}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const elements = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = elements[0];
        const last = elements.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          requestClose();
      }}
    >
      {children}
    </dialog>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/shared/Icon';
import { copyResponseText } from './responseActions';
import styles from './ChatWorkspace.module.css';

export function CopyResponse({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'copied' | 'error'>(
    'idle',
  );
  const busy = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      generation.current += 1;
      clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    if (busy.current) return;
    busy.current = true;
    const token = generation.current;
    setStatus('pending');
    try {
      await copyResponseText(text);
      if (token !== generation.current) return;
      setStatus('copied');
      timer.current = setTimeout(() => {
        busy.current = false;
        setStatus('idle');
      }, 1500);
    } catch {
      if (token !== generation.current) return;
      busy.current = false;
      setStatus('error');
    }
  }
  const label = status === 'copied' ? 'Скопировано' : 'Копировать ответ';
  return (
    <div className={styles.responseActions}>
      <button
        type="button"
        className={styles.responseActionButton}
        aria-label={label}
        title={label}
        aria-busy={status === 'pending'}
        disabled={status === 'pending' || status === 'copied'}
        onClick={() => void copy()}
      >
        <Icon name={status === 'copied' ? 'check' : 'copy'} />
      </button>
      <span
        role="status"
        aria-atomic="true"
        className={
          status === 'error' ? styles.copyError : styles.visuallyHidden
        }
      >
        {status === 'error'
          ? 'Не удалось скопировать ответ'
          : status === 'copied'
            ? 'Скопировано'
            : ''}
      </span>
    </div>
  );
}

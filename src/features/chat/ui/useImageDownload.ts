import { useEffect, useRef, useState } from 'react';
import { downloadResponseImage } from './responseActions';

export function useImageDownload(imageSrc: string | null) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'error'>('idle');
  const current = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      const controller = current.current;
      current.current = null;
      controller?.abort();
    },
    [imageSrc],
  );

  async function download() {
    if (!imageSrc || current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setStatus('pending');
    try {
      await downloadResponseImage(
        imageSrc,
        import.meta.env.BASE_URL,
        controller.signal,
      );
      if (current.current === controller) setStatus('idle');
    } catch {
      if (current.current === controller && !controller.signal.aborted)
        setStatus('error');
    } finally {
      if (current.current === controller) current.current = null;
    }
  }
  return { pending: status === 'pending', error: status === 'error', download };
}

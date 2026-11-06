import { useAppSelector } from '@/app/hooks';
import { Icon } from '@/shared/Icon';
import styles from './ChatWorkspace.module.css';

export function StorageNotice() {
  const status = useAppSelector((state) => state.app.storageStatus);
  if (status.status !== 'unavailable') return null;
  return (
    <div className={styles.storageNotice} role="status">
      <Icon name="warning" />
      <p>
        {status.reason === 'read_error'
          ? 'Не удалось восстановить сохранённые диалоги. Можно продолжить в новом чате, но в этой сессии история не сохраняется.'
          : 'История сейчас не сохраняется. Ты можешь продолжить чат, но новые сообщения и черновики могут исчезнуть после перезагрузки.'}
      </p>
    </div>
  );
}

import { useAppSelector } from '@/app/hooks';
import { Icon } from '@/shared/Icon';
import styles from './ChatWorkspace.module.css';
import { useLocale } from '@/app/useLocale';

export function StorageNotice() {
  const status = useAppSelector((state) => state.app.storageStatus);
  const { locale } = useLocale();
  if (status.status !== 'unavailable') return null;
  return (
    <div className={styles.storageNotice} role="status">
      <Icon name="warning" />
      <p>
        {status.reason === 'read_error'
          ? locale.ui.storage.readError
          : locale.ui.storage.writeError}
      </p>
    </div>
  );
}

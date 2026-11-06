import { useSelector } from 'react-redux';
import type { RootState } from './store';
import styles from './App.module.css';

export function App() {
  const storageStatus = useSelector(
    (state: RootState) => state.app.storageStatus,
  );
  return (
    <main className={styles.page}>
      <section className={styles.intro} aria-labelledby="welcome-title">
        <p className={styles.brand}>LOM AI</p>
        <h1 id="welcome-title" className={styles.title}>
          Разберёмся с задачей вместе
        </h1>
        <p className={styles.description}>
          Чат с учебным помощником скоро появится здесь.
        </p>
        {storageStatus.status === 'unavailable' && (
          <p className={styles.notice} role="status">
            {storageStatus.reason === 'read_error'
              ? 'Не удалось восстановить сохранённые диалоги. Можно продолжить в новом чате, но в этой сессии история не сохраняется.'
              : 'История сейчас не сохраняется. Ты можешь продолжить чат, но новые сообщения и черновики могут исчезнуть после перезагрузки.'}
          </p>
        )}
      </section>
    </main>
  );
}

import styles from './App.module.css';

export function App() {
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
      </section>
    </main>
  );
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from '@/app/App';
import { createAppStore } from '@/app/store';
import '@/app/styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Не найден корневой элемент приложения.');
}

const store = createAppStore({ storage: () => window.localStorage });

import.meta.hot?.dispose(() => {
  void store.dispose();
});

createRoot(rootElement).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);

import { configureStore } from '@reduxjs/toolkit';

export function createAppStore() {
  return configureStore({
    // Feature reducers будут подключены на этапе модели чатов.
    reducer: (state: Record<string, never> = {}) => state,
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Language } from '@/shared/language';

export type StorageStatus =
  | { status: 'available' }
  | { status: 'unavailable'; reason: 'read_error' | 'write_error' };

interface AppState {
  storageStatus: StorageStatus;
  language: Language;
}

const initialState: AppState = {
  storageStatus: { status: 'available' },
  language: 'en',
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    languageChanged(state, { payload }: PayloadAction<Language>) {
      state.language = payload;
    },
    storageUnavailable(
      state,
      { payload: reason }: PayloadAction<'read_error' | 'write_error'>,
    ) {
      state.storageStatus = { status: 'unavailable', reason };
    },
  },
});

export const appActions = appSlice.actions;
export const appReducer = appSlice.reducer;

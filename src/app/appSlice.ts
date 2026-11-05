import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type StorageStatus =
  | { status: 'available' }
  | { status: 'unavailable'; reason: 'read_error' | 'write_error' };

interface AppState {
  storageStatus: StorageStatus;
}

const initialState: AppState = { storageStatus: { status: 'available' } };

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
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

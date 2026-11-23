import type { Language } from '@/shared/language';

export const LANGUAGE_STORAGE_KEY = 'lom-ai:language';

export function readLanguagePreference(): Language {
  try {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return storedLanguage === 'ru' ? 'ru' : 'en';
  } catch {
    return 'en';
  }
}

export function saveLanguagePreference(language: Language) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Language selection still works for the current session when storage is unavailable.
  }
}

export function attachLanguagePersistence(options: {
  getLanguage: () => Language;
  subscribe: (listener: () => void) => () => void;
}) {
  let previous = options.getLanguage();
  return options.subscribe(() => {
    const next = options.getLanguage();
    if (next === previous) return;
    previous = next;
    saveLanguagePreference(next);
  });
}

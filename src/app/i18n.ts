import en from '@/locales/en.json';
import ru from '@/locales/ru.json';
import type { Language } from '@/shared/language';

export type LocaleDictionary = typeof ru;

const dictionaries: Record<Language, LocaleDictionary> = {
  ru,
  en,
};

export function getDictionary(language: Language): LocaleDictionary {
  return dictionaries[language];
}

export function localizeChatTitle(title: string, language: Language) {
  if (title === ru.ui.newChatTitle || title === en.ui.newChatTitle)
    return dictionaries[language].ui.newChatTitle;
  return title;
}

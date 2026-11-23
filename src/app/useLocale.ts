import { useAppSelector } from './hooks';
import { getDictionary } from './i18n';

export function useLocale() {
  const language = useAppSelector((state) => state.app.language);
  return { language, locale: getDictionary(language) };
}

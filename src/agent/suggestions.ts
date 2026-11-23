import type { LearningContext } from './context';
import { getDictionary } from '@/app/i18n';
import type { Language } from '@/shared/language';

export const EMPTY_SUGGESTIONS: readonly string[] = Object.freeze([]);
export function getSuggestions(
  context: LearningContext,
  language: Language = 'en',
): readonly string[] {
  const text = getDictionary(language).agent.suggestions;
  if (context.topic === 'newton') {
    return [
      ...(!context.simplified ? [text.simplify] : []),
      ...(!context.diagramShown ? [text.diagram] : []),
      ...(!context.exampleShown ? [text.lifeExample] : []),
    ];
  }
  if (context.topic === 'equation') {
    if (context.step !== 4)
      return context.questionAnswered
        ? [text.next]
        : [
            text.next,
            text.equationQuestions[String(context.step) as '1' | '2' | '3'],
            ];
    return [
      ...(!context.verificationDetailed ? [text.verifyDetail] : []),
      ...(!context.verificationExplained
        ? [text.verifyMethod]
        : []),
    ];
  }
  return EMPTY_SUGGESTIONS;
}

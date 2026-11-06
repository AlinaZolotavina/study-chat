import type { LearningContext } from './context';

export const EMPTY_SUGGESTIONS: readonly string[] = Object.freeze([]);
const equationQuestions = {
  1: 'Почему нужно раскрывать скобки?',
  2: 'Почему −12 + 5 = −7?',
  3: 'Почему при переносе меняется знак?',
} as const;

export function getSuggestions(context: LearningContext): readonly string[] {
  if (context.topic === 'newton') {
    return [
      ...(!context.simplified ? ['Объясни проще'] : []),
      ...(!context.diagramShown ? ['Покажи схему'] : []),
      ...(!context.exampleShown ? ['Приведи пример из жизни'] : []),
    ];
  }
  if (context.topic === 'equation') {
    if (context.step !== 4)
      return context.questionAnswered
        ? ['Дальше']
        : ['Дальше', equationQuestions[context.step]];
    return [
      ...(!context.verificationDetailed ? ['Покажи проверку подробнее'] : []),
      ...(!context.verificationExplained
        ? ['Объясни, как проверить ответ']
        : []),
    ];
  }
  return EMPTY_SUGGESTIONS;
}

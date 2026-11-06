import type { Command } from './commands';
import type { LearningContext } from './context';
import type { AgentError } from './types';

type Scenario =
  | { kind: 'text' | 'image'; text: string }
  | { kind: 'calculator'; left: number; right: number }
  | { kind: 'error'; text: string; error: AgentError };

export function chooseScenario(
  command: Command,
  context: LearningContext,
  attempt: number,
): Scenario {
  switch (command.kind) {
    case 'demo_error':
    case 'demo_partial_error':
      if (attempt === 1)
        return {
          kind: 'error',
          text:
            command.kind === 'demo_error'
              ? ''
              : 'Начнём с первого шага: выделим известные данные и определим, что нужно найти. ',
          error: {
            code:
              command.kind === 'demo_error'
                ? 'demo_failure'
                : 'demo_partial_failure',
            retryable: true,
          },
        };
      return {
        kind: 'text',
        text: 'Теперь ответ сформирован успешно. Учебная тема и текущий шаг сохранены — можно продолжить с того места, где мы остановились.',
      };
    case 'archimedes':
      return {
        kind: 'text',
        text: '**Закон Архимеда:** на тело, погружённое в жидкость, действует направленная вверх выталкивающая сила.\n\nОна равна весу вытесненной жидкости: Fₐ = ρ · g · V, где ρ — плотность жидкости, g — ускорение свободного падения, V — объём погружённой части тела.\n\nПри одной и той же жидкости чем больше этот объём, тем больше выталкивающая сила. Хочешь — объясню проще.',
      };
    case 'simplify':
      return {
        kind: 'text',
        text:
          context.topic === 'archimedes'
            ? 'Представь мяч, который ты погружаешь в воду. Вода толкает его обратно вверх — это выталкивающая сила. Мяч занимает место, где раньше была вода, то есть вытесняет её.\n\nВ одной и той же воде чем больше погружённая часть мяча, тем сильнее вода толкает его вверх.\n\nЧтобы увидеть иллюстрацию, напиши: «Покажи схему».'
            : 'Что объяснить проще? В этой демоверсии начни с команды «Объясни закон Архимеда», а затем попроси «Объясни проще».',
      };
    case 'diagram':
      if (context.topic === 'archimedes' && context.simplified)
        return {
          kind: 'image',
          text: 'На схеме показан закон Архимеда: на погружённое в жидкость тело действует выталкивающая сила, направленная вверх. Её величина равна весу вытесненной жидкости: Fₐ = ρ · g · V.',
        };
      return {
        kind: 'text',
        text:
          context.topic === 'archimedes'
            ? 'Сначала напиши «Объясни проще». После простого объяснения я покажу схему закона Архимеда.'
            : 'Для какой темы показать схему? В демоверсии доступен закон Архимеда: напиши «Объясни закон Архимеда», затем «Объясни проще» и «Покажи схему».',
      };
    case 'equation':
      return {
        kind: 'text',
        text: 'Решим **2x + 6 = 14** по шагам.\n\nСначала нужно оставить слагаемое с x отдельно. Для этого вычти 6 из обеих частей равенства.\n\nНапиши «Дальше», когда будешь готов к следующему шагу.',
      };
    case 'next':
      if (context.topic !== 'equation')
        return {
          kind: 'text',
          text: 'Какую задачу продолжить? Напиши «Помоги решить уравнение» — разберём 2x + 6 = 14 по шагам.',
        };
      return {
        kind: 'text',
        text:
          context.step === 0
            ? 'После вычитания 6 из обеих частей получаем **2x = 8**.\n\nТеперь раздели обе части на 2, чтобы оставить x без множителя. Напиши «Дальше», чтобы проверить результат.'
            : context.step === 1
              ? 'Делим обе части на 2: **x = 4**.\n\nПроверка: 2 · 4 + 6 = 14. Равенство верно — уравнение решено!'
              : 'Уравнение уже решено: x = 4. Можно начать его заново командой «Помоги решить уравнение» или выбрать другой пример.',
      };
    case 'calculator':
      return { kind: 'calculator', left: command.left, right: command.right };
    case 'unsupported':
      return {
        kind: 'text',
        text: 'Я работаю в деморежиме и пока поддерживаю несколько учебных сценариев. Попробуй один из запросов:\n\n- «Объясни закон Архимеда»\n- «Помоги решить уравнение»\n- «Сколько будет 17 × 24?»',
      };
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}

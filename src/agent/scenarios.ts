import type { Command } from './commands';
import type { LearningContext } from './context';
import { applyCompletedCommand } from './context';
import { EQUATION_CHECK_DETAIL, EQUATION_STEPS } from './equation';
import type { AgentError } from './types';

type Scenario =
  | { kind: 'text' | 'image'; text: string }
  | { kind: 'calculator'; left: number; right: number }
  | { kind: 'error'; text: string; error: AgentError };

function fallback(context: LearningContext): Scenario {
  const introduction =
    'Я работаю в деморежиме и пока понимаю только подготовленные команды.';
  if (context.topic === 'newton')
    return {
      kind: 'text',
      text: `${introduction}\n\nМы обсуждаем второй закон Ньютона. Можно попросить объяснить проще, показать схему или привести пример из жизни.`,
    };
  if (context.topic === 'equation') {
    const subject =
      context.step === 1
        ? 'раскрытие скобок'
        : context.step === 2
          ? 'сложение −12 и 5'
          : 'перенос слагаемых';
    return {
      kind: 'text',
      text: `${introduction}\n\n${context.step === 4 ? 'Можем подробнее разобрать проверку найденного ответа.' : `В нашем примере разбираем ${subject}. Чтобы продолжить решение, выбери «Дальше».`}`,
    };
  }
  return {
    kind: 'text',
    text: `${introduction} Попробуй один из запросов:\n\n- «Объясни второй закон Ньютона»\n- «Помоги решить уравнение»\n- «Сколько будет 17 × 24?»`,
  };
}

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
        text: 'Теперь ответ сформирован успешно. Можем продолжить разбирать задачу.',
      };
    case 'newton':
      return {
        kind: 'text',
        text: '**Второй закон Ньютона** связывает равнодействующую силу, массу и ускорение тела: **F = m · a**, или **a = F / m**.\n\nF — сумма действующих на тело сил в ньютонах, m — масса в килограммах, a — ускорение в м/с². Ускорение направлено вдоль равнодействующей силы.\n\nПри одинаковой массе большая сила даёт большее ускорение. При одинаковой силе более массивное тело получает меньшее ускорение. Например, сила 6 Н сообщает телу массой 2 кг ускорение 3 м/с².\n\nМожно выбрать простое объяснение, схему или пример из жизни в любом порядке.',
      };
    case 'simplify':
      return context.topic === 'newton'
        ? {
            kind: 'text',
            text: 'Представь пустую тележку и тяжёлый автомобиль. Если толкать их с одинаковой силой, тележка разгонится заметнее: её масса меньше.\n\nТеперь толкни ту же тележку сильнее — её скорость начнёт меняться быстрее. Это и есть ускорение. Второй закон Ньютона говорит: **сильнее толкаем — больше ускорение; больше масса — меньше ускорение при той же силе**.',
          }
        : fallback(context);
    case 'diagram':
      if (context.topic === 'newton')
        return {
          kind: 'image',
          text: 'На схеме показан второй закон Ньютона: **a = F / m**. Стрелки силы и ускорения направлены одинаково. При той же массе удвоение равнодействующей силы удваивает ускорение; при той же силе удвоение массы уменьшает ускорение вдвое.',
        };
      return fallback(context);
    case 'life_example':
      return context.topic === 'newton'
        ? {
            kind: 'text',
            text: 'Пример из жизни — удар по футбольному мячу. Во время удара нога действует на мяч силой, и скорость мяча меняется. Чем больше равнодействующая сила при той же массе мяча, тем больше его ускорение.\n\nЕсли с той же силой толкнуть более тяжёлый мяч, его ускорение будет меньше. Важно: закон связывает силу с **изменением скорости**, а не с самой скоростью. После окончания удара движение определяют силы, которые продолжают действовать на мяч.',
          }
        : fallback(context);
    case 'equation': {
      const nextContext = applyCompletedCommand(context, command);
      return {
        kind: 'text',
        text: EQUATION_STEPS[
          nextContext.topic === 'equation' ? nextContext.step : 1
        ].answer,
      };
    }
    case 'next':
      if (context.topic !== 'equation')
        return {
          kind: 'text',
          text: 'Какую задачу продолжить? Напиши «Помоги решить уравнение», чтобы начать пошаговое решение.',
        };
      return {
        kind: 'text',
        text:
          context.step === 4
            ? 'Уравнение уже решено: x = 21/4 = 5,25. Можно уточнить проверку ответа или выбрать другую учебную тему.'
            : EQUATION_STEPS[
                context.step === 1 ? 2 : context.step === 2 ? 3 : 4
              ].answer,
      };
    case 'explain_brackets':
    case 'explain_constants':
    case 'explain_transfer': {
      const step =
        command.kind === 'explain_brackets'
          ? 1
          : command.kind === 'explain_constants'
            ? 2
            : 3;
      return context.topic === 'equation' && context.step === step
        ? { kind: 'text', text: EQUATION_STEPS[step].detail }
        : fallback(context);
    }
    case 'verify_detail':
    case 'verify_method':
      return context.topic === 'equation' && context.step === 4
        ? {
            kind: 'text',
            text:
              command.kind === 'verify_detail'
                ? EQUATION_CHECK_DETAIL
                : 'Чтобы проверить корень, подставь найденное значение вместо каждого x именно в исходное уравнение. Вычисли левую и правую части отдельно, соблюдая порядок действий: скобки, умножение, сложение.\n\nПри x = 5,25 обе части равны 24,5. Поэтому найденное число подходит. Равенство в одном промежуточном преобразовании не заменяет проверку исходного уравнения.',
          }
        : fallback(context);
    case 'calculator':
      return { kind: 'calculator', left: command.left, right: command.right };
    case 'unsupported':
      return fallback(context);
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}

import type { Command } from './commands';
import type { LearningContext } from './context';
import { applyCompletedCommand } from './context';
import type { DemoFailureKind } from './types';
import { getDictionary } from '@/app/i18n';
import type { Language } from '@/shared/language';

type Scenario =
  | { kind: 'text'; text: string; interrupt?: boolean }
  | { kind: 'image'; text: ''; fail: boolean }
  | {
      kind: 'calculator';
      operation: 'add' | 'subtract' | 'multiply' | 'divide';
      left: number;
      right: number;
      fail: boolean;
    };

function fallback(context: LearningContext, language: Language): Scenario {
  const text = getDictionary(language).agent.fallback;
  const introduction = text.introduction;
  if (context.topic === 'newton')
    return {
      kind: 'text',
      text: `${introduction}\n\n${text.newton}`,
    };
  if (context.topic === 'equation') {
    const subject =
      text.equationSubjects[
        context.step === 1 ? 0 : context.step === 2 ? 1 : 2
      ] ?? '';
    return {
      kind: 'text',
      text: `${introduction}\n\n${context.step === 4 ? text.equationFinished : text.equationContinue.replace('{subject}', subject)}`,
    };
  }
  return {
    kind: 'text',
    text: `${introduction} ${text.examplesIntro}\n\n${text.examples.map((example) => `- “${example}”`).join('\n')}`,
  };
}

// Purely select a prepared response from the command, learning context, and failures
// already demonstrated. UI and delays are handled by mockAgent.
export function chooseScenario(
  command: Command,
  context: LearningContext,
  demonstratedFailures: readonly DemoFailureKind[],
  language: Language = 'en',
): Scenario {
  const text = getDictionary(language).agent;
  switch (command.kind) {
    case 'newton':
      return {
        kind: 'text',
        text: text.newton.answer,
      };
    case 'simplify':
      return context.topic === 'newton'
        ? { kind: 'text', text: text.newton.simplified }
        : fallback(context, language);
    case 'diagram':
      if (context.topic === 'newton')
        return {
          kind: 'image',
          text: '',
          fail: !demonstratedFailures.includes('image'),
        };
      return fallback(context, language);
    case 'life_example':
      return context.topic === 'newton'
        ? {
            kind: 'text',
            text: text.newton.lifeExample,
          }
        : fallback(context, language);
    case 'equation': {
      const nextContext = applyCompletedCommand(context, command);
      return {
        kind: 'text',
        text: text.equation.steps[
          String(
            nextContext.topic === 'equation' ? nextContext.step : 1,
          ) as keyof typeof text.equation.steps
        ].answer
          .replace('{equation}', text.equation.expression)
          .replace('{check}', text.equation.check),
      };
    }
    case 'next':
      if (context.topic !== 'equation')
        return {
          kind: 'text',
          text: text.equation.nextWithoutEquation,
        };
      return {
        kind: 'text',
        interrupt:
          context.step === 2 && !demonstratedFailures.includes('equation'),
        text:
          context.step === 4
            ? text.equation.solved
            : text.equation.steps[
                String(
                  context.step === 1 ? 2 : context.step === 2 ? 3 : 4,
                ) as keyof typeof text.equation.steps
              ].answer
                .replace('{equation}', text.equation.expression)
                .replace('{check}', text.equation.check),
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
        ? {
            kind: 'text',
            text: text.equation.steps[String(step) as '1' | '2' | '3'].detail,
          }
        : fallback(context, language);
    }
    case 'verify_detail':
    case 'verify_method':
      return context.topic === 'equation' && context.step === 4
        ? {
            kind: 'text',
            text:
              command.kind === 'verify_detail'
                ? text.equation.checkDetail
                : text.equation.verifyMethod,
          }
        : fallback(context, language);
    case 'calculator':
      return {
        kind: 'calculator',
        operation: command.operation,
        left: command.left,
        right: command.right,
        fail: !demonstratedFailures.includes('calculator'),
      };
    case 'unsupported':
      return fallback(context, language);
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}

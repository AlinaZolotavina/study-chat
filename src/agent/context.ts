import { classifyCommand, type Command } from './commands';
import type { AgentHistoryTurn } from './types';

export type EquationStep = 1 | 2 | 3 | 4;
export type LearningContext =
  | { topic: 'none' | 'calculator' }
  | {
      topic: 'newton';
      simplified: boolean;
      diagramShown: boolean;
      exampleShown: boolean;
    }
  | {
      topic: 'equation';
      step: EquationStep;
      questionAnswered: boolean;
      verificationDetailed: boolean;
      verificationExplained: boolean;
    };

// Replay only completed user commands. Both the agent and UI use this transition.
export function applyCompletedCommand(
  context: LearningContext,
  command: Command,
): LearningContext {
  switch (command.kind) {
    case 'newton':
      return context.topic === 'newton'
        ? context
        : {
            topic: 'newton',
            simplified: false,
            diagramShown: false,
            exampleShown: false,
          };
    case 'simplify':
      return context.topic === 'newton'
        ? { ...context, simplified: true }
        : context;
    case 'diagram':
      return context.topic === 'newton'
        ? { ...context, diagramShown: true }
        : context;
    case 'life_example':
      return context.topic === 'newton'
        ? { ...context, exampleShown: true }
        : context;
    case 'equation':
      return context.topic === 'equation'
        ? context
        : {
            topic: 'equation',
            step: 1,
            questionAnswered: false,
            verificationDetailed: false,
            verificationExplained: false,
          };
    case 'next':
      if (context.topic !== 'equation' || context.step === 4) return context;
      return {
        ...context,
        step: context.step === 1 ? 2 : context.step === 2 ? 3 : 4,
        questionAnswered: false,
      };
    case 'verify_detail':
      return context.topic === 'equation' && context.step === 4
        ? { ...context, verificationDetailed: true }
        : context;
    case 'verify_method':
      return context.topic === 'equation' && context.step === 4
        ? { ...context, verificationExplained: true }
        : context;
    case 'calculator':
      return { topic: 'calculator' };
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
        ? { ...context, questionAnswered: true }
        : context;
    }
    case 'unsupported':
      return context;
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}

export function deriveContext(
  history: readonly AgentHistoryTurn[],
): LearningContext {
  return history.reduce<LearningContext>(
    (context, turn) =>
      applyCompletedCommand(context, classifyCommand(turn.userText)),
    { topic: 'none' },
  );
}

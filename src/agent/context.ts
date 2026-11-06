import { classifyCommand } from './commands';
import type { AgentHistoryTurn } from './types';

export type LearningContext =
  | { topic: 'none' | 'calculator' }
  | { topic: 'archimedes'; simplified: boolean }
  | { topic: 'equation'; step: 0 | 1 | 2 };

export function deriveContext(
  history: readonly AgentHistoryTurn[],
): LearningContext {
  let context: LearningContext = { topic: 'none' };
  for (const turn of history) {
    const command = classifyCommand(turn.userText);
    switch (command.kind) {
      case 'demo_error':
      case 'demo_partial_error':
      case 'diagram':
        break;
      case 'archimedes':
        context = { topic: 'archimedes', simplified: false };
        break;
      case 'simplify':
        if (context.topic === 'archimedes')
          context = { topic: 'archimedes', simplified: true };
        break;
      case 'equation':
        context = { topic: 'equation', step: 0 };
        break;
      case 'next':
        if (context.topic === 'equation')
          context = { topic: 'equation', step: context.step === 0 ? 1 : 2 };
        break;
      case 'calculator':
        context = { topic: 'calculator' };
        break;
      case 'unsupported':
        context = { topic: 'none' };
        break;
      default: {
        const unreachable: never = command;
        return unreachable;
      }
    }
  }
  return context;
}

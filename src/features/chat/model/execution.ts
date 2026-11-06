import type { AgentActionKind } from '@/agent/types';
import type { Run } from './types';

export const AGENT_ACTION_LABELS: Readonly<Record<AgentActionKind, string>> = {
  analyzed: 'Проанализировал запрос',
  calculated: 'Выполнил вычисление с помощью калькулятора',
  image_prepared: 'Подготовил схему',
  answer_composed: 'Сформировал ответ',
};

function counted(value: number, forms: readonly [string, string, string]) {
  const lastTwo = value % 100;
  const last = value % 10;
  const form =
    lastTwo >= 11 && lastTwo <= 14
      ? forms[2]
      : last === 1
        ? forms[0]
        : last >= 2 && last <= 4
          ? forms[1]
          : forms[2];
  return `${value} ${form}`;
}

export function formatExecutionDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (totalSeconds === 0) return 'менее секунды';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return [
    ...(minutes ? [counted(minutes, ['минуту', 'минуты', 'минут'])] : []),
    ...(seconds ? [counted(seconds, ['секунду', 'секунды', 'секунд'])] : []),
  ].join(' ');
}

export function getCompletedExecutionLabel(
  run: Extract<Run, { status: 'completed' }>,
) {
  return `Думал ${formatExecutionDuration(Date.parse(run.finishedAt) - Date.parse(run.acceptedAt))}`;
}

import type { AgentActionKind } from '@/agent/types';
import type { Run } from './types';

export const AGENT_ACTION_LABELS: Readonly<Record<AgentActionKind, string>> = {
  analyzed: 'Проанализировал запрос',
  calculated: 'Выполнил вычисление с помощью калькулятора',
  image_prepared: 'Использовал генератор изображений',
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
  const tenths = Number.isFinite(milliseconds)
    ? Math.max(0, Math.round(milliseconds / 100))
    : 0;
  const minutes = Math.floor(tenths / 600);
  const seconds = (tenths % 600) / 10;
  const secondsLabel = `${seconds.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} сек`;
  return [
    ...(minutes ? [counted(minutes, ['минуту', 'минуты', 'минут'])] : []),
    ...(!minutes || seconds ? [secondsLabel] : []),
  ].join(' ');
}

export function getCompletedExecutionLabel(
  run: Extract<Run, { status: 'completed' }>,
) {
  return `Думал ${formatExecutionDuration(Date.parse(run.finishedAt) - Date.parse(run.acceptedAt))}`;
}

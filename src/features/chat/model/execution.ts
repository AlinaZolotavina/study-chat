import type { AgentActionKind } from '@/agent/types';
import type { Run } from './types';
import { getDictionary } from '@/app/i18n';
import type { Language } from '@/shared/language';

export function getAgentActionLabels(
  language: Language = 'en',
): Readonly<Record<AgentActionKind, string>> {
  return getDictionary(language).status.actionLabels;
}

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

export function formatExecutionDuration(
  milliseconds: number,
  language: Language = 'en',
) {
  const executionText = getDictionary(language).ui.execution;
  const tenths = Number.isFinite(milliseconds)
    ? Math.max(0, Math.round(milliseconds / 100))
    : 0;
  const minutes = Math.floor(tenths / 600);
  const seconds = (tenths % 600) / 10;
  const numberLocale = language === 'ru' ? 'ru-RU' : 'en-US';
  const secondsLabel = `${seconds.toLocaleString(numberLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${executionText.seconds}`;
  return [
    ...(minutes
      ? [
          counted(
            minutes,
            executionText.minuteForms as [string, string, string],
          ),
        ]
      : []),
    ...(!minutes || seconds ? [secondsLabel] : []),
  ].join(' ');
}

export function getCompletedExecutionLabel(
  run: Extract<Run, { status: 'completed' }>,
  language: Language = 'en',
) {
  const prefix = getDictionary(language).ui.execution.completedPrefix;
  return `${prefix} ${formatExecutionDuration(Date.parse(run.finishedAt) - Date.parse(run.acceptedAt), language)}`;
}

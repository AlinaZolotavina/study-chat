import { useId, type ReactNode } from 'react';
import { useAppDispatch } from '@/app/hooks';
import { Icon } from '@/shared/Icon';
import { chatActions } from '../model/chatsSlice';
import { getAgentActionLabels } from '../model/execution';
import { isActiveRun } from '../model/helpers';
import { getAgentStatusLabel } from '../model/selectors';
import type { AssistantMessage } from '../model/types';
import styles from './ChatWorkspace.module.css';
import { useLocale } from '@/app/useLocale';

export function ExecutionStatus({
  chatId,
  message,
  actions,
}: {
  chatId: string;
  message: AssistantMessage;
  actions?: ReactNode;
}) {
  const dispatch = useAppDispatch();
  const { language, locale } = useLocale();
  const historyId = useId();
  const { run } = message;
  const active = isActiveRun(run);
  const label =
    run.status === 'failed'
      ? locale.ui.execution.failedHistory
      : getAgentStatusLabel(run, language);
  const actionLabels = getAgentActionLabels(language);
  return (
    <div className={styles.execution}>
      <div className={styles.executionHeader}>
        <button
          type="button"
          className={styles.executionToggle}
          aria-label={label ?? undefined}
          aria-expanded={run.expanded}
          aria-controls={historyId}
          onClick={() =>
            dispatch(
              chatActions.executionExpandedChanged({
                chatId,
                assistantMessageId: message.id,
                runId: run.id,
                expanded: !run.expanded,
              }),
            )
          }
        >
          {active && (
            <span className={styles.activityIndicator} aria-hidden="true" />
          )}
          <span role="status" aria-atomic="true">
            {label}
          </span>
          <Icon
            name="chevron"
            className={`${styles.executionChevron} ${run.expanded ? styles.executionChevronExpanded : ''}`}
          />
        </button>
        {actions}
      </div>
      <div
        id={historyId}
        className={`${styles.executionHistory} ${run.expanded ? styles.executionHistoryExpanded : ''}`}
        aria-hidden={!run.expanded}
        inert={!run.expanded}
      >
        <div className={styles.executionHistoryInner}>
          {run.actions.length > 0 ? (
            <ul
              className={styles.executionActions}
              aria-label={locale.ui.execution.actions}
            >
              {run.actions.map((action) => (
                <li key={action.id}>{actionLabels[action.kind]}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.executionEmpty}>
              {locale.ui.execution.noActions}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

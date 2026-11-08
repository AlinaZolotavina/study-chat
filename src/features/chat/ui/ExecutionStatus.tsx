import { useId, type ReactNode } from 'react';
import { useAppDispatch } from '@/app/hooks';
import { Icon } from '@/shared/Icon';
import { chatActions } from '../model/chatsSlice';
import { AGENT_ACTION_LABELS } from '../model/execution';
import { isActiveRun } from '../model/helpers';
import { getAgentStatusLabel } from '../model/selectors';
import type { AssistantMessage } from '../model/types';
import styles from './ChatWorkspace.module.css';

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
  const historyId = useId();
  const { run } = message;
  const active = isActiveRun(run);
  const label =
    run.status === 'failed' ? 'История действий' : getAgentStatusLabel(run);
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
              aria-label="Выполненные действия"
            >
              {run.actions.map((action) => (
                <li key={action.id}>{AGENT_ACTION_LABELS[action.kind]}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.executionEmpty}>
              Завершённых действий пока нет
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

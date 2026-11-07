import { memo } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Icon } from '@/shared/Icon';
import { retryResponse } from '../model/commands';
import { getAgentStatusLabel, selectCanRetry } from '../model/selectors';
import type { Message } from '../model/types';
import { MessageImage } from './MessageImage';
import { MarkdownContent } from './MarkdownContent';
import { SuggestedReplies } from './SuggestedReplies';
import { ExecutionStatus } from './ExecutionStatus';
import styles from './ChatWorkspace.module.css';

export const MessageItem = memo(function MessageItem({
  message,
  chatId,
  onRequestStarted,
  isLast,
}: {
  message: Message;
  chatId: string;
  onRequestStarted: () => void;
  isLast: boolean;
}) {
  const dispatch = useAppDispatch();
  const canRetry = useAppSelector((state) =>
    selectCanRetry(state, chatId, message.id),
  );
  const assistant = message.role === 'assistant';
  const status = assistant ? getAgentStatusLabel(message.run) : null;
  const failed = assistant && message.run.status === 'failed';
  return (
    <li className={assistant ? styles.assistantMessage : styles.userBubble}>
      <article aria-labelledby={`author-${message.id}`}>
        <div className={styles.messageAuthor} id={`author-${message.id}`}>
          {assistant && (
            <Icon name="sparkle" className={styles.agentMark ?? ''} />
          )}
          {assistant ? 'LOM AI' : 'Вы'}
        </div>
        {!assistant ? (
          <p className={styles.userText}>{message.text}</p>
        ) : (
          <>
            {/* Mount from queued to distinguish a live call from reopening a running chat. */}
            <MessageImage
              key={message.run.id}
              imageSrc={message.imageSrc}
              imageAlt={message.imageAlt}
              run={message.run}
            />
            {message.text && <MarkdownContent text={message.text} />}
            <ExecutionStatus chatId={chatId} message={message} />
            {failed && (
              <div
                className={`${styles.agentStatus} ${failed ? styles.errorText : ''}`}
                role="status"
                aria-atomic="true"
              >
                <Icon name="warning" />
                <span>{status}</span>
              </div>
            )}
            {canRetry && (
              <button
                type="button"
                className={styles.retryButton}
                aria-label="Повторить ответ на последний вопрос"
                onClick={() => {
                  if (dispatch(retryResponse(chatId, message.id)))
                    onRequestStarted();
                }}
              >
                <Icon name="retry" />
                Повторить
              </button>
            )}
            {isLast && (
              <SuggestedReplies
                chatId={chatId}
                messageId={message.id}
                onRequestStarted={onRequestStarted}
              />
            )}
          </>
        )}
      </article>
    </li>
  );
});

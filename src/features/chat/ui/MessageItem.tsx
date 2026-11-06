import { memo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Icon } from '@/shared/Icon';
import { retryResponse } from '../model/commands';
import { isActiveRun } from '../model/helpers';
import { getAgentStatusLabel, selectCanRetry } from '../model/selectors';
import type { Message } from '../model/types';
import { localImageUrl } from './contentPolicy';
import { MarkdownContent } from './MarkdownContent';
import { SuggestedReplies } from './SuggestedReplies';
import styles from './ChatWorkspace.module.css';

function MessageImage({ imageSrc }: { imageSrc: string }) {
  const [failed, setFailed] = useState(false);
  const src = localImageUrl(imageSrc, import.meta.env.BASE_URL);
  return (
    <figure className={styles.imageFigure}>
      {failed || !src ? (
        <p role="status" className={styles.imageError}>
          Не удалось загрузить изображение
        </p>
      ) : (
        <img
          src={src}
          width={1672}
          height={941}
          alt="Второй закон Ньютона: сила и ускорение направлены одинаково; a = F / m. При той же массе удвоение силы удваивает ускорение, при той же силе удвоение массы уменьшает его вдвое."
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <figcaption>
        Второй закон Ньютона: ускорение зависит от равнодействующей силы и массы
        тела.
      </figcaption>
    </figure>
  );
}

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
  const active = assistant && isActiveRun(message.run);
  const failed = assistant && message.run.status === 'failed';
  return (
    <li className={assistant ? styles.assistantMessage : styles.userBubble}>
      <article aria-labelledby={`author-${message.id}`}>
        <div className={styles.messageAuthor} id={`author-${message.id}`}>
          {assistant && (
            <span className={styles.agentAvatar} aria-hidden="true">
              L
            </span>
          )}
          {assistant ? 'LOM AI' : 'Вы'}
        </div>
        {!assistant ? (
          <p className={styles.userText}>{message.text}</p>
        ) : (
          <>
            {message.imageSrc && (
              <MessageImage
                key={`${message.run.id}:${message.imageSrc}`}
                imageSrc={message.imageSrc}
              />
            )}
            {message.text && <MarkdownContent text={message.text} />}
            {status && (
              <div
                className={`${styles.agentStatus} ${failed ? styles.errorText : ''}`}
                role="status"
                aria-atomic="true"
              >
                {active && (
                  <span
                    className={styles.activityIndicator}
                    aria-hidden="true"
                  />
                )}
                {failed && <Icon name="warning" />}
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

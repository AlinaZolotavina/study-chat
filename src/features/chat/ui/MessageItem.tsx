import { memo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Icon } from '@/shared/Icon';
import { retryResponse } from '../model/commands';
import { getAgentStatusLabel, selectCanRetry } from '../model/selectors';
import type { Message } from '../model/types';
import { localImageUrl } from './contentPolicy';
import { MarkdownContent } from './MarkdownContent';
import { SuggestedReplies } from './SuggestedReplies';
import { ExecutionStatus } from './ExecutionStatus';
import styles from './ChatWorkspace.module.css';

function MessageImage({ imageSrc }: { imageSrc: string | null }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [live] = useState(imageSrc === null);
  const [revealing, setRevealing] = useState(false);
  const src = imageSrc && localImageUrl(imageSrc, import.meta.env.BASE_URL);
  const error = failed || (!!imageSrc && !src);
  return (
    <figure className={styles.imageFigure}>
      <div className={styles.imageFrame} aria-busy={!loaded && !error}>
        {error ? (
          <p role="status" className={styles.imageError}>
            Не удалось загрузить изображение
          </p>
        ) : (
          <>
            {!loaded && (
              <div className={styles.imagePlaceholder} role="status">
                <span className={styles.activityIndicator} aria-hidden="true" />
                {imageSrc ? 'Загружаю изображение…' : 'Создаю изображение…'}
              </div>
            )}
            {src && (
              <img
                src={src}
                className={`${!loaded ? styles.imageLoading : ''} ${revealing ? styles.imageReveal : ''}`}
                width={1672}
                height={941}
                alt="Второй закон Ньютона: сила и ускорение направлены одинаково; a = F / m. При той же массе удвоение силы удваивает ускорение, при той же силе удвоение массы уменьшает его вдвое."
                loading="lazy"
                onLoad={() => {
                  setLoaded(true);
                  setRevealing(
                    live &&
                      !window.matchMedia('(prefers-reduced-motion: reduce)')
                        .matches,
                  );
                }}
                onAnimationEnd={() => setRevealing(false)}
                onError={() => setFailed(true)}
              />
            )}
          </>
        )}
      </div>
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
  const failed = assistant && message.run.status === 'failed';
  const preparingImage =
    assistant &&
    message.run.status === 'processing' &&
    message.run.phase.kind === 'preparing_image';
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
            {(message.imageSrc || preparingImage) && (
              <MessageImage key={message.run.id} imageSrc={message.imageSrc} />
            )}
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

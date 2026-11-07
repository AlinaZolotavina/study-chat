import { useId, useLayoutEffect, type RefObject } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Icon } from '@/shared/Icon';
import { chatActions } from '../model/chatsSlice';
import { sendMessage, stopGeneration } from '../model/commands';
import { getChatById, MAX_MESSAGE_LENGTH } from '../model/helpers';
import { selectActiveRun, selectCanSend } from '../model/selectors';
import styles from './ChatWorkspace.module.css';

export function Composer({
  chatId,
  isMobile,
  inputRef,
  onSent,
}: {
  chatId: string;
  isMobile: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onSent: () => void;
}) {
  const dispatch = useAppDispatch();
  const draft = useAppSelector(
    (state) => getChatById(state.chats, chatId)?.draft ?? '',
  );
  const canSend = useAppSelector((state) => selectCanSend(state, chatId));
  const active = useAppSelector((state) => !!selectActiveRun(state, chatId));
  const id = useId();
  const tooLong = draft.length > MAX_MESSAGE_LENGTH;
  const hasHint = !isMobile && !active;
  const description =
    [hasHint ? `${id}-hint` : '', tooLong ? `${id}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined;
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = '0px';
    const limit =
      window.innerHeight < 500 ? 96 : Math.min(160, window.innerHeight * 0.3);
    input.style.height = `${Math.max(isMobile ? 44 : 52, Math.min(input.scrollHeight, limit))}px`;
  }, [draft, chatId, inputRef, isMobile]);

  function send() {
    if (dispatch(sendMessage(chatId))) onSent();
  }
  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className={styles.composerInner}>
        <div
          className={`${styles.inputBox} ${tooLong ? styles.invalidInput : ''}`}
        >
          <textarea
            id={id}
            ref={inputRef}
            className={styles.textarea}
            rows={1}
            value={draft}
            placeholder="Спроси LOM AI"
            aria-label="Сообщение"
            aria-invalid={tooLong}
            aria-describedby={description}
            onChange={(event) =>
              dispatch(
                chatActions.draftChanged({ chatId, draft: event.target.value }),
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <div className={styles.composerActions}>
            {active && (
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Остановить ответ"
                title="Остановить ответ"
                onClick={() => dispatch(stopGeneration(chatId))}
              >
                <Icon name="stop" />
              </button>
            )}
            <button
              type="submit"
              className={`${styles.iconButton} ${styles.sendButton}`}
              disabled={!canSend}
              aria-label="Отправить сообщение"
              title="Отправить сообщение"
              aria-keyshortcuts="Enter"
            >
              <Icon name="send" />
            </button>
          </div>
        </div>
        {tooLong && (
          <p id={`${id}-error`} className={styles.inputError} role="status">
            Слишком длинное сообщение. Максимум — 4000 символов.
          </p>
        )}
        <div className={styles.composerFooter}>
          {hasHint && (
            <p id={`${id}-hint`} className={styles.composerHint}>
              Enter — отправить · Shift+Enter — новая строка
            </p>
          )}
          <span
            className={`${styles.counter} ${tooLong ? styles.errorText : ''}`}
            aria-label="Количество символов"
          >
            {draft.length} / {MAX_MESSAGE_LENGTH}
          </span>
        </div>
      </div>
    </form>
  );
}

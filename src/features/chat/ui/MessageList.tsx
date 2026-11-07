import { useLayoutEffect, useRef, useState } from 'react';
import { useAppSelector } from '@/app/hooks';
import { Icon } from '@/shared/Icon';
import { getChatById } from '../model/helpers';
import { selectChatMessages } from '../model/selectors';
import { LEARNING_PROMPTS } from './demoPrompts';
import { MessageItem } from './MessageItem';
import styles from './ChatWorkspace.module.css';

export function MessageList({
  chatId,
  scrollRequest,
  onExample,
  onRequestStarted,
}: {
  chatId: string;
  scrollRequest: number;
  onExample: (text: string) => void;
  onRequestStarted: () => void;
}) {
  const messages = useAppSelector((state) => selectChatMessages(state, chatId));
  const hasDraft = useAppSelector(
    (state) => (getChatById(state.chats, chatId)?.draft.length ?? 0) > 0,
  );
  const viewport = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const lastRequest = useRef(scrollRequest);
  const [readingEarlier, setReadingEarlier] = useState(false);
  useLayoutEffect(() => {
    if (lastRequest.current !== scrollRequest) {
      followBottom.current = true;
      lastRequest.current = scrollRequest;
    }
    if (followBottom.current && viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [messages, scrollRequest]);

  function jumpToLatest() {
    followBottom.current = true;
    setReadingEarlier(false);
    if (viewport.current) {
      viewport.current.scrollTop = viewport.current.scrollHeight;
      viewport.current.focus({ preventScroll: true });
    }
  }
  return (
    <div className={styles.conversationArea}>
      <div
        className={styles.conversation}
        ref={viewport}
        role="region"
        aria-label="История диалога"
        tabIndex={0}
        onScroll={(event) => {
          const element = event.currentTarget;
          const following =
            element.scrollHeight - element.clientHeight - element.scrollTop <=
            80;
          followBottom.current = following;
          setReadingEarlier(!following);
        }}
      >
        {messages.length === 0 ? (
          <section className={styles.emptyState} aria-labelledby="empty-title">
            <h2 id="empty-title">Разберёмся с задачей вместе</h2>
            <p className={styles.emptyDescription}>
              Задай вопрос по учёбе или выбери пример. Можно попросить объяснить
              проще или разбирать задачу по шагам.
            </p>
            <div className={styles.promptGrid}>
              {LEARNING_PROMPTS.map((prompt) => (
                <button
                  key={prompt.text}
                  type="button"
                  className={styles.promptCard}
                  disabled={hasDraft}
                  onClick={() => onExample(prompt.text)}
                >
                  <span>{prompt.title}</span>
                  <span className={styles.promptDescription}>
                    {prompt.description}
                  </span>
                </button>
              ))}
            </div>
            {hasDraft && (
              <p className={styles.exampleHint}>
                Чтобы выбрать пример, сначала очисти поле
              </p>
            )}
            <p className={styles.demoNote}>
              Демоверсия: ответы подготовлены заранее. Лучше всего работают
              вопросы из примеров.
            </p>
          </section>
        ) : (
          <ol className={styles.messages}>
            {messages.map((message, index) => (
              <MessageItem
                key={message.id}
                message={message}
                chatId={chatId}
                onRequestStarted={onRequestStarted}
                isLast={index === messages.length - 1}
              />
            ))}
          </ol>
        )}
      </div>
      {readingEarlier && messages.length > 0 && (
        <div className={styles.jumpBar}>
          <button type="button" onClick={jumpToLatest}>
            <Icon name="down" />К новым сообщениям
          </button>
        </div>
      )}
    </div>
  );
}

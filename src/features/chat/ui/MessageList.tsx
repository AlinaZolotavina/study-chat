import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from 'react';
import { useAppSelector } from '@/app/hooks';
import { Icon } from '@/shared/Icon';
import { getChatById } from '../model/helpers';
import { selectChatMessages } from '../model/selectors';
import { LEARNING_PROMPTS } from './demoPrompts';
import { MessageItem } from './MessageItem';
import styles from './ChatWorkspace.module.css';

export interface ScrollState {
  scrollTop: number;
  followBottom: boolean;
}

export interface MessageListHandle {
  savePosition: () => void;
}

interface ScrollControls extends MessageListHandle {
  followLatest: () => void;
  jumpToLatest: () => void;
  update: () => void;
}

export function MessageList({
  ref,
  chatId,
  positions,
  scrollRequest,
  onExample,
  onRequestStarted,
}: {
  ref?: Ref<MessageListHandle>;
  chatId: string;
  positions: RefObject<Map<string, ScrollState>>;
  scrollRequest: number;
  onExample: (text: string) => void;
  onRequestStarted: () => void;
}) {
  const messages = useAppSelector((state) => selectChatMessages(state, chatId));
  const hasDraft = useAppSelector(
    (state) => (getChatById(state.chats, chatId)?.draft.length ?? 0) > 0,
  );
  const viewport = useRef<HTMLDivElement>(null);
  const controls = useRef<ScrollControls | null>(null);
  const lastRequest = useRef(scrollRequest);
  const [readingEarlier, setReadingEarlier] = useState(false);

  useImperativeHandle(ref, () => ({
    savePosition: () => controls.current?.savePosition(),
  }));

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const saved = positions.current.get(chatId);
    let followBottom = saved?.followBottom ?? true;
    let scrollTop = saved?.scrollTop ?? 0;
    let jumping = false;
    let endTimer: ReturnType<typeof setTimeout> | undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const maxScroll = () =>
      Math.max(0, element.scrollHeight - element.clientHeight);
    const savePosition = () => {
      scrollTop = element.scrollTop;
      positions.current.set(chatId, { scrollTop, followBottom });
    };
    const update = () => {
      if (!jumping)
        element.scrollTop = followBottom
          ? maxScroll()
          : Math.min(scrollTop, maxScroll());
      savePosition();
    };
    const clearEndTimer = () => {
      clearTimeout(endTimer);
      endTimer = undefined;
    };
    const scheduleEnd = () => {
      clearEndTimer();
      // Also finishes the transition in browsers without scrollend.
      endTimer = setTimeout(finishJump, 150);
    };
    const finishJump = (): void => {
      if (!jumping) return;
      clearEndTimer();
      if (maxScroll() - element.scrollTop > 1) {
        // Text may have arrived while the first native transition was running.
        element.scrollTo({ top: maxScroll(), behavior: 'smooth' });
        scheduleEnd();
        return;
      }
      jumping = false;
      followBottom = true;
      savePosition();
      setReadingEarlier(false);
    };
    const stopJump = () => {
      clearEndTimer();
      if (jumping) {
        jumping = false;
        element.scrollTo({ top: element.scrollTop, behavior: 'instant' });
      }
    };
    const onScroll = () => {
      if (!jumping) {
        followBottom = maxScroll() - element.scrollTop <= 80;
        setReadingEarlier(!followBottom);
      } else scheduleEnd();
      savePosition();
    };
    const interrupt = () => {
      if (!jumping) return;
      stopJump();
      onScroll();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'PageUp',
          'PageDown',
          'Home',
          'End',
          ' ',
        ].includes(event.key)
      )
        interrupt();
    };
    const followLatest = () => {
      stopJump();
      followBottom = true;
      update();
    };
    const onMotionChange = () => {
      if (reducedMotion.matches && jumping) {
        followLatest();
        setReadingEarlier(false);
      }
    };
    const jumpToLatest = () => {
      if (jumping) return;
      followBottom = true;
      setReadingEarlier(false);
      element.focus({ preventScroll: true });
      if (reducedMotion.matches) {
        update();
        return;
      }
      jumping = true;
      element.scrollTo({ top: maxScroll(), behavior: 'smooth' });
      scheduleEnd();
    };
    controls.current = { savePosition, update, followLatest, jumpToLatest };
    update();
    element.addEventListener('scroll', onScroll);
    element.addEventListener('scrollend', finishJump);
    element.addEventListener('wheel', interrupt, { passive: true });
    element.addEventListener('touchstart', interrupt, { passive: true });
    element.addEventListener('pointerdown', interrupt);
    element.addEventListener('keydown', onKeyDown);
    reducedMotion.addEventListener('change', onMotionChange);
    const observer = new ResizeObserver(() => {
      update();
      setReadingEarlier(!followBottom);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('scrollend', finishJump);
      element.removeEventListener('wheel', interrupt);
      element.removeEventListener('touchstart', interrupt);
      element.removeEventListener('pointerdown', interrupt);
      element.removeEventListener('keydown', onKeyDown);
      reducedMotion.removeEventListener('change', onMotionChange);
      stopJump();
      controls.current = null;
    };
  }, [chatId, positions]);

  useLayoutEffect(() => {
    if (lastRequest.current !== scrollRequest) {
      lastRequest.current = scrollRequest;
      controls.current?.followLatest();
    } else {
      controls.current?.update();
    }
  }, [messages, scrollRequest]);
  return (
    <div className={styles.conversationArea}>
      <div
        className={styles.conversation}
        ref={viewport}
        role="region"
        aria-label="История диалога"
        tabIndex={0}
      >
        {messages.length === 0 ? (
          <section className={styles.emptyState} aria-labelledby="empty-title">
            <h2 id="empty-title">С чем нужна помощь?</h2>
            <p className={styles.emptyDescription}>
              Задай вопрос, проверь вычисление или выбери, с чего начать.
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
          <button
            type="button"
            onClick={() => controls.current?.jumpToLatest()}
          >
            <Icon name="down" />К новым сообщениям
          </button>
        </div>
      )}
    </div>
  );
}

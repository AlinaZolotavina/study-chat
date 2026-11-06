import { useCallback, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector, useAppStore } from '@/app/hooks';
import { chatActions } from '../model/chatsSlice';
import { createChat } from '../model/commands';
import { selectChatRowMetadata, selectSelectedChat } from '../model/selectors';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { Sidebar } from './Sidebar';
import { StorageNotice } from './StorageNotice';
import styles from './ChatWorkspace.module.css';

export function ChatWorkspace() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const selectedChatId = useAppSelector((state) => state.chats.selectedChatId);
  const metadata = useAppSelector((state) =>
    selectChatRowMetadata(state, selectedChatId),
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [scrollRequest, setScrollRequest] = useState(0);
  const onRequestStarted = useCallback(() => {
    setScrollRequest((value) => value + 1);
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  const onSelect = useCallback(
    (chatId: string) => {
      dispatch(chatActions.chatSelected(chatId));
      requestAnimationFrame(() =>
        headingRef.current?.focus({ preventScroll: true }),
      );
    },
    [dispatch],
  );
  const onNewChat = useCallback(() => {
    dispatch(createChat());
    inputRef.current?.focus({ preventScroll: true });
  }, [dispatch]);
  const onExample = useCallback(
    (text: string) => {
      const chat = selectSelectedChat(store.getState());
      if (!chat || chat.draft.length > 0) return;
      dispatch(chatActions.draftChanged({ chatId: chat.id, draft: text }));
      inputRef.current?.focus({ preventScroll: true });
    },
    [dispatch, store],
  );

  return (
    <div className={styles.workspace}>
      <Sidebar
        selectedChatId={selectedChatId}
        onSelect={onSelect}
        onNewChat={onNewChat}
        onExample={onExample}
      />
      <main className={styles.chatPanel}>
        <header className={styles.chatHeader}>
          <div className={styles.headerTitle}>
            <p>LOM AI</p>
            <h1 ref={headingRef} tabIndex={-1} title={metadata?.title}>
              {metadata?.title ?? 'Новый диалог'}
            </h1>
          </div>
          <span className={styles.demoBadge}>Демоверсия</span>
        </header>
        <StorageNotice />
        <MessageList
          key={selectedChatId}
          chatId={selectedChatId}
          scrollRequest={scrollRequest}
          onExample={onExample}
          onRequestStarted={onRequestStarted}
        />
        <Composer
          chatId={selectedChatId}
          inputRef={inputRef}
          onSent={onRequestStarted}
        />
      </main>
    </div>
  );
}

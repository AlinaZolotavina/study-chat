import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useAppDispatch, useAppSelector, useAppStore } from '@/app/hooks';
import { chatActions } from '../model/chatsSlice';
import { createChat } from '../model/commands';
import { Icon } from '@/shared/Icon';
import { selectChatRowMetadata, selectSelectedChat } from '../model/selectors';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { Sidebar } from './Sidebar';
import { StorageNotice } from './StorageNotice';
import styles from './ChatWorkspace.module.css';

const MOBILE_QUERY = '(width < 768px)';
const getIsMobile = () => window.matchMedia(MOBILE_QUERY).matches;

export function ChatWorkspace() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const selectedChatId = useAppSelector((state) => state.chats.selectedChatId);
  const metadata = useAppSelector((state) =>
    selectChatRowMetadata(state, selectedChatId),
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [sidebarPanel, setSidebarPanel] = useState<'chats' | 'about' | null>(
    null,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const subscribeToViewport = useCallback(
    (notify: () => void) => {
      const query = window.matchMedia(MOBILE_QUERY);
      const onChange = () => {
        if (sidebarPanel !== null) {
          setSidebarPanel(null);
          requestAnimationFrame(() =>
            headingRef.current?.focus({ preventScroll: true }),
          );
        }
        notify();
      };
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    [sidebarPanel],
  );
  const isMobile = useSyncExternalStore(subscribeToViewport, getIsMobile);
  const [scrollRequest, setScrollRequest] = useState(0);
  const onRequestStarted = useCallback(() => {
    setScrollRequest((value) => value + 1);
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  const onSelect = useCallback(
    (chatId: string) => {
      setSidebarPanel(null);
      dispatch(chatActions.chatSelected(chatId));
      requestAnimationFrame(() =>
        headingRef.current?.focus({ preventScroll: true }),
      );
    },
    [dispatch],
  );
  const onNewChat = useCallback(() => {
    setSidebarPanel(null);
    dispatch(createChat());
    requestAnimationFrame(() =>
      (isMobile ? headingRef.current : inputRef.current)?.focus({
        preventScroll: true,
      }),
    );
  }, [dispatch, isMobile]);
  const onExample = useCallback(
    (text: string) => {
      const chat = selectSelectedChat(store.getState());
      if (!chat || chat.draft.length > 0) return;
      dispatch(chatActions.draftChanged({ chatId: chat.id, draft: text }));
      setSidebarPanel(null);
      requestAnimationFrame(() =>
        inputRef.current?.focus({ preventScroll: true }),
      );
    },
    [dispatch, store],
  );

  return (
    <div
      className={`${styles.workspace} ${!isMobile && sidebarCollapsed ? styles.collapsedWorkspace : ''}`}
    >
      <Sidebar
        isMobile={isMobile}
        collapsed={!isMobile && sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        sidebarPanel={sidebarPanel}
        onCloseMenu={() => setSidebarPanel(null)}
        onOpenAbout={() => setSidebarPanel('about')}
        onCloseAbout={() => setSidebarPanel(isMobile ? 'chats' : null)}
        selectedChatId={selectedChatId}
        onSelect={onSelect}
        onNewChat={onNewChat}
        onExample={onExample}
      />
      <main className={styles.chatPanel}>
        <header className={styles.chatHeader}>
          {isMobile && (
            <button
              type="button"
              className={styles.menuButton}
              aria-label="Открыть меню диалогов"
              aria-expanded={sidebarPanel !== null}
              aria-controls="mobile-chat-menu"
              onClick={() => setSidebarPanel('chats')}
            >
              <Icon name="menu" />
            </button>
          )}
          <div className={styles.headerTitle}>
            <h1 ref={headingRef} tabIndex={-1} title={metadata?.title}>
              {metadata?.title ?? 'Новый диалог'}
            </h1>
          </div>
          {!isMobile && <span className={styles.demoBadge}>Демоверсия</span>}
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

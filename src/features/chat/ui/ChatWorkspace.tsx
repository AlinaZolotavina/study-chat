import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAppDispatch, useAppSelector, useAppStore } from '@/app/hooks';
import { appActions } from '@/app/appSlice';
import { localizeChatTitle } from '@/app/i18n';
import { useLocale } from '@/app/useLocale';
import { chatActions } from '../model/chatsSlice';
import { createChat, deleteChat } from '../model/commands';
import { Icon } from '@/shared/Icon';
import { selectChatRowMetadata, selectSelectedChat } from '../model/selectors';
import { Composer } from './Composer';
import {
  MessageList,
  type MessageListHandle,
  type ScrollState,
} from './MessageList';
import { ChatDialog } from './ChatDialog';
import { Sidebar } from './Sidebar';
import { StorageNotice } from './StorageNotice';
import styles from './ChatWorkspace.module.css';

const MOBILE_QUERY = '(width < 768px)';
const getIsMobile = () => window.matchMedia(MOBILE_QUERY).matches;

export function ChatWorkspace() {
  // Workspace connects the sidebar, history, and composer. It keeps only shell
  // state locally (panels, focus, and scroll), not chat domain data.
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { language, locale } = useLocale();
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
  const [chatIdToDelete, setChatIdToDelete] = useState<string | null>(null);
  const deletingChat = useAppSelector((state) =>
    selectChatRowMetadata(state, chatIdToDelete ?? ''),
  );
  const workspaceRef = useRef<HTMLDivElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const messageListRef = useRef<MessageListHandle>(null);
  const scrollPositions = useRef(new Map<string, ScrollState>());
  const subscribeToViewport = useCallback(
    (notify: () => void) => {
      const query = window.matchMedia(MOBILE_QUERY);
      const onChange = () => {
        if (sidebarPanel !== null || chatIdToDelete !== null) {
          setSidebarPanel(null);
          setChatIdToDelete(null);
          deleteTrigger.current = null;
          requestAnimationFrame(() =>
            headingRef.current?.focus({ preventScroll: true }),
          );
        }
        notify();
      };
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    [sidebarPanel, chatIdToDelete],
  );
  const isMobile = useSyncExternalStore(subscribeToViewport, getIsMobile);
  const [scrollRequest, setScrollRequest] = useState(0);
  const onRequestStarted = useCallback(() => {
    setScrollRequest((value) => value + 1);
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  const onSelect = useCallback(
    (chatId: string) => {
      messageListRef.current?.savePosition();
      setSidebarPanel(null);
      dispatch(chatActions.chatSelected(chatId));
      requestAnimationFrame(() =>
        headingRef.current?.focus({ preventScroll: true }),
      );
    },
    [dispatch],
  );
  const onNewChat = useCallback(() => {
    messageListRef.current?.savePosition();
    setSidebarPanel(null);
    dispatch(createChat(locale.ui.newChatTitle));
    requestAnimationFrame(() =>
      (isMobile ? headingRef.current : inputRef.current)?.focus({
        preventScroll: true,
      }),
    );
  }, [dispatch, isMobile, locale.ui.newChatTitle]);
  const onDelete = useCallback((chatId: string, trigger: HTMLButtonElement) => {
    deleteTrigger.current = trigger;
    setChatIdToDelete(chatId);
  }, []);

  function cancelDelete() {
    const trigger = deleteTrigger.current;
    deleteTrigger.current = null;
    setChatIdToDelete(null);
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      else headingRef.current?.focus({ preventScroll: true });
    });
  }

  function confirmDelete() {
    if (!chatIdToDelete) return;
    const { chats } = store.getState();
    const index = chats.order.indexOf(chatIdToDelete);
    const selected = chats.selectedChatId === chatIdToDelete;
    messageListRef.current?.savePosition();
    const deleted = dispatch(deleteChat(chatIdToDelete, locale.ui.newChatTitle));
    deleteTrigger.current = null;
    if (deleted) scrollPositions.current.delete(chatIdToDelete);
    setChatIdToDelete(null);
    if (selected) setSidebarPanel(null);
    const remaining = store.getState().chats;
    const neighbor = remaining.order[index] ?? remaining.order[index - 1];
    requestAnimationFrame(() => {
      const button = Array.from(
        workspaceRef.current?.querySelectorAll<HTMLButtonElement>(
          'button[data-chat-id]',
        ) ?? [],
      ).find((element) => element.dataset.chatId === neighbor);
      if (!selected && button) button.focus({ preventScroll: true });
      else headingRef.current?.focus({ preventScroll: true });
    });
  }
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
  useEffect(() => {
    if (!languageMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setLanguageMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLanguageMenuOpen(false);
        languageButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [languageMenuOpen]);

  const chooseLanguage = (nextLanguage: 'ru' | 'en') => {
    dispatch(appActions.languageChanged(nextLanguage));
    setLanguageMenuOpen(false);
  };

  return (
    <div
      ref={workspaceRef}
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
        onDelete={onDelete}
        onNewChat={onNewChat}
      />
      <main className={styles.chatPanel}>
        <header className={styles.chatHeader}>
          {isMobile && (
            <button
              type="button"
              className={styles.menuButton}
              aria-label={locale.ui.mobileMenu}
              aria-expanded={sidebarPanel !== null}
              aria-controls="mobile-chat-menu"
              onClick={() => setSidebarPanel('chats')}
            >
              <Icon name="menu" />
            </button>
          )}
          <div className={styles.headerTitle}>
            <h1
              ref={headingRef}
              tabIndex={-1}
              title={metadata ? localizeChatTitle(metadata.title, language) : undefined}
            >
              {metadata
                ? localizeChatTitle(metadata.title, language)
                : locale.ui.newChatTitle}
            </h1>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.demoBadge}>{locale.ui.demoBadge}</span>
            <div className={styles.languagePicker} ref={languageMenuRef}>
              <button
                ref={languageButtonRef}
                type="button"
                className={styles.languageButton}
                aria-label={locale.ui.languageSwitch}
                title={locale.ui.languageSwitch}
                aria-haspopup="menu"
                aria-expanded={languageMenuOpen}
                onClick={() => setLanguageMenuOpen((open) => !open)}
              >
                <Icon name="globe" />
                <span>{language.toUpperCase()}</span>
                <Icon name="chevron" className={styles.languageChevron ?? ''} />
              </button>
              {languageMenuOpen && (
                <div className={styles.languageMenu} role="menu" aria-label={locale.ui.languageSwitch}>
                  {(['en', 'ru'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="menuitemradio"
                      aria-checked={language === option}
                      onClick={() => chooseLanguage(option)}
                    >
                      {option.toUpperCase()}
                      {language === option && (
                        <Icon name="check" className={styles.languageCheck ?? ''} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>
        <StorageNotice />
        <MessageList
          ref={messageListRef}
          key={selectedChatId}
          chatId={selectedChatId}
          positions={scrollPositions}
          scrollRequest={scrollRequest}
          onExample={onExample}
          onRequestStarted={onRequestStarted}
        />
        <Composer
          chatId={selectedChatId}
          isMobile={isMobile}
          inputRef={inputRef}
          onSent={onRequestStarted}
        />
      </main>
      {deletingChat && (
        <ChatDialog
          id="delete-chat-dialog"
          labelledBy="delete-chat-title"
          className={styles.deleteDialog ?? ''}
          onClose={cancelDelete}
        >
          <h2 id="delete-chat-title">{locale.ui.deleteDialog.title}</h2>
          <p>
            {locale.ui.deleteDialog.beforeTitle}{' '}
            <strong className={styles.deleteChatTitle}>
              {language === 'ru'
                ? `«${localizeChatTitle(deletingChat.title, language)}»`
                : `“${localizeChatTitle(deletingChat.title, language)}”`}
            </strong>
            {locale.ui.deleteDialog.afterTitle}
          </p>
          {deletingChat.isActive && (
            <p>{locale.ui.deleteDialog.activeNotice}</p>
          )}
          <div className={styles.deleteDialogActions}>
            <button type="button" onClick={cancelDelete} autoFocus>
              {locale.ui.deleteDialog.cancel}
            </button>
            <button
              type="button"
              className={styles.confirmDelete}
              onClick={confirmDelete}
            >
              {locale.ui.deleteDialog.confirm}
            </button>
          </div>
        </ChatDialog>
      )}
    </div>
  );
}

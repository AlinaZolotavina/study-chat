import { memo, useRef } from 'react';
import { useAppSelector } from '@/app/hooks';
import { Icon } from '@/shared/Icon';
import {
  selectChatRowMetadata,
  selectOrderedChatIds,
} from '../model/selectors';
import { ChatDialog, type ChatDialogHandle } from './ChatDialog';
import styles from './ChatWorkspace.module.css';

const ChatRow = memo(function ChatRow({
  chatId,
  selected,
  onSelect,
  onDelete,
}: {
  chatId: string;
  selected: boolean;
  onSelect: (chatId: string) => void;
  onDelete: (chatId: string, trigger: HTMLButtonElement) => void;
}) {
  const metadata = useAppSelector((state) =>
    selectChatRowMetadata(state, chatId),
  );
  if (!metadata) return null;
  const unread = !selected && metadata.hasUnreadReply;
  const accessibleName = [
    metadata.title,
    metadata.isActive ? 'Формируется ответ' : '',
    unread ? 'Новый ответ' : '',
    metadata.hasError ? 'Ошибка ответа' : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <li className={styles.chatListItem}>
      <button
        type="button"
        className={`${styles.chatRow} ${selected ? styles.selectedRow : ''} ${metadata.isActive ? styles.generatingRow : ''}`}
        onClick={() => onSelect(chatId)}
        aria-current={selected ? 'true' : undefined}
        aria-label={accessibleName}
        title={metadata.title}
        data-chat-id={chatId}
      >
        <Icon name="chat" className={styles.chatIcon ?? ''} />
        <span className={styles.chatTitle}>{metadata.title}</span>
        <span className={styles.chatMarker} aria-hidden="true">
          {unread ? (
            <span className={styles.unreadDot} />
          ) : metadata.hasError ? (
            <Icon name="warning" className={styles.rowError ?? ''} />
          ) : null}
        </span>
      </button>
      <button
        type="button"
        className={styles.deleteChatButton}
        aria-label={`Удалить диалог «${metadata.title}»`}
        title="Удалить диалог"
        onClick={(event) => onDelete(chatId, event.currentTarget)}
      >
        <Icon name="trash" />
      </button>
    </li>
  );
});

function BrandLockup() {
  return (
    <div className={styles.brandLockup}>
      <Icon name="sparkle" className={styles.brandMark ?? ''} />
      <div>
        <div className={styles.brand}>
          LOM <span>AI</span>
        </div>
        <p className={styles.brandCaption}>Твой учебный помощник</p>
      </div>
    </div>
  );
}

function DemoContent() {
  return (
    <div className={styles.demoContent}>
      <p>
        Ответы подготовлены заранее. Лучше всего работают вопросы из примеров.
      </p>
      <p>
        В каждом диалоге предусмотрены три демонстрационных сбоя — по одному
        каждого вида. Нажми «Повторить», чтобы получить полный ответ.
      </p>
      <ul>
        <li>Калькулятор: ошибка инструмента до получения результата.</li>
        <li>
          Уравнение: обрыв объяснения при переходе от приведения подобных к
          переносу слагаемых.
        </li>
        <li>Схема Ньютона: ошибка генератора без готового изображения.</li>
      </ul>
      <p>
        Показанные сбои запоминаются после перезагрузки. Остановка до ошибки не
        расходует демонстрацию сбоя.
      </p>
    </div>
  );
}

export function Sidebar({
  isMobile,
  collapsed,
  onToggle,
  sidebarPanel,
  onCloseMenu,
  onOpenAbout,
  onCloseAbout,
  selectedChatId,
  onSelect,
  onDelete,
  onNewChat,
}: {
  isMobile: boolean;
  collapsed: boolean;
  onToggle: () => void;
  sidebarPanel: 'chats' | 'about' | null;
  onCloseMenu: () => void;
  onOpenAbout: () => void;
  onCloseAbout: () => void;
  selectedChatId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string, trigger: HTMLButtonElement) => void;
  onNewChat: () => void;
}) {
  const chatIds = useAppSelector(selectOrderedChatIds);
  const aboutDialogRef = useRef<ChatDialogHandle>(null);
  const newChatButton = (
    <button
      type="button"
      className={
        collapsed
          ? `${styles.railButton} ${styles.railNewChat}`
          : styles.newChatButton
      }
      onClick={onNewChat}
      aria-label="Новый диалог"
      title={collapsed ? 'Новый диалог' : undefined}
    >
      <Icon name="plus" />
      {!collapsed && 'Новый диалог'}
    </button>
  );
  const aboutButton = (
    <button
      type="button"
      className={collapsed ? styles.railButton : styles.aboutButton}
      aria-label="О демоверсии"
      title={collapsed ? 'О демоверсии' : undefined}
      onClick={onOpenAbout}
    >
      <Icon name="info" />
      {!collapsed && 'О демоверсии'}
    </button>
  );
  const navigation = (
    <>
      <h2 className={styles.sidebarTitle} id="dialogs-title">
        Диалоги
      </h2>
      <nav className={styles.chatNavigation} aria-labelledby="dialogs-title">
        <ul className={styles.chatList}>
          {chatIds.map((chatId) => (
            <ChatRow
              key={chatId}
              chatId={chatId}
              selected={chatId === selectedChatId}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
        </ul>
      </nav>
    </>
  );
  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsedSidebar : ''}`}
      aria-label="Диалоги и справка"
    >
      <div className={styles.sidebarHeader}>
        {!collapsed && <BrandLockup />}
        {isMobile && <span className={styles.demoBadge}>Демоверсия</span>}
        {!isMobile && (
          <button
            type="button"
            className={styles.sidebarToggle}
            aria-label={
              collapsed
                ? 'Развернуть панель диалогов'
                : 'Свернуть панель диалогов'
            }
            title={
              collapsed
                ? 'Развернуть панель диалогов'
                : 'Свернуть панель диалогов'
            }
            aria-expanded={!collapsed}
            aria-controls="desktop-sidebar-content"
            onClick={onToggle}
          >
            <Icon name={collapsed ? 'panel_open' : 'panel_close'} />
          </button>
        )}
      </div>
      {!isMobile && (
        <div
          key={collapsed ? 'rail' : 'full'}
          id="desktop-sidebar-content"
          className={styles.sidebarContent}
        >
          <div className={styles.sidebarActions}>{newChatButton}</div>
          {!collapsed && navigation}
          <div className={styles.sidebarFooter}>{aboutButton}</div>
        </div>
      )}
      {isMobile && sidebarPanel !== null && (
        <ChatDialog
          id="mobile-chat-menu"
          labelledBy="dialogs-title"
          className={styles.menuDialog ?? ''}
          onClose={onCloseMenu}
        >
          <div className={styles.sidebarHeader}>
            <BrandLockup />
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="Закрыть меню диалогов"
              onClick={onCloseMenu}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className={styles.drawerActions}>{newChatButton}</div>
          {navigation}
          <div className={styles.sidebarFooter}>{aboutButton}</div>
        </ChatDialog>
      )}
      {sidebarPanel === 'about' && (
        <ChatDialog
          ref={aboutDialogRef}
          id="demo-dialog"
          labelledBy="demo-dialog-title"
          className={styles.aboutDialog ?? ''}
          onClose={onCloseAbout}
          animated
        >
          <div className={styles.demoDialogHeader}>
            <h2 id="demo-dialog-title">О демоверсии</h2>
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="Закрыть справку"
              onClick={() => aboutDialogRef.current?.close()}
            >
              <Icon name="close" />
            </button>
          </div>
          <DemoContent />
        </ChatDialog>
      )}
    </aside>
  );
}

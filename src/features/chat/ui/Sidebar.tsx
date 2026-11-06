import { memo } from 'react';
import { useAppSelector } from '@/app/hooks';
import { Icon } from '@/shared/Icon';
import {
  selectChatRowMetadata,
  selectOrderedChatIds,
} from '../model/selectors';
import { getChatById } from '../model/helpers';
import { ERROR_PROMPTS } from './demoPrompts';
import styles from './ChatWorkspace.module.css';

const ChatRow = memo(function ChatRow({
  chatId,
  selected,
  onSelect,
}: {
  chatId: string;
  selected: boolean;
  onSelect: (chatId: string) => void;
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
    <li>
      <button
        type="button"
        className={`${styles.chatRow} ${selected ? styles.selectedRow : ''} ${metadata.isActive ? styles.generatingRow : ''}`}
        onClick={() => onSelect(chatId)}
        aria-current={selected ? 'true' : undefined}
        aria-label={accessibleName}
        title={metadata.title}
      >
        <span className={styles.chatTitle}>{metadata.title}</span>
        <span className={styles.chatMarker} aria-hidden="true">
          {unread ? (
            <span className={styles.unreadDot} />
          ) : metadata.hasError ? (
            <Icon name="warning" className={styles.rowError ?? ''} />
          ) : null}
        </span>
      </button>
    </li>
  );
});

export function Sidebar({
  selectedChatId,
  onSelect,
  onNewChat,
  onExample,
}: {
  selectedChatId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onExample: (text: string) => void;
}) {
  const chatIds = useAppSelector(selectOrderedChatIds);
  const hasDraft = useAppSelector(
    (state) =>
      (getChatById(state.chats, selectedChatId)?.draft.length ?? 0) > 0,
  );
  return (
    <aside className={styles.sidebar} aria-label="Диалоги и справка">
      <div className={styles.sidebarHeader}>
        <div className={styles.brand}>
          LOM <span>AI</span>
        </div>
        <p className={styles.brandCaption}>Твой учебный помощник</p>
        <button
          type="button"
          className={styles.newChatButton}
          onClick={onNewChat}
        >
          <Icon name="plus" />
          Новый диалог
        </button>
      </div>
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
            />
          ))}
        </ul>
      </nav>
      <div className={styles.sidebarFooter}>
        <details className={styles.demoDetails}>
          <summary>О демоверсии</summary>
          <p>
            Ответы подготовлены заранее. Лучше всего работают вопросы из
            примеров.
          </p>
          <p>
            Хочешь проверить, что произойдёт при сбое? Выбери пример и отправь
            сообщение.
          </p>
          <div className={styles.errorExamples}>
            {ERROR_PROMPTS.map((text) => (
              <button
                key={text}
                type="button"
                disabled={hasDraft}
                onClick={() => onExample(text)}
              >
                {text}
              </button>
            ))}
          </div>
          {hasDraft && (
            <p className={styles.exampleHint}>
              Чтобы выбрать пример, сначала очисти поле
            </p>
          )}
        </details>
      </div>
    </aside>
  );
}

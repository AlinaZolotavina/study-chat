import { useId } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { sendMessage } from '../model/commands';
import { selectChatSuggestions } from '../model/selectors';
import styles from './ChatWorkspace.module.css';

export function SuggestedReplies({
  chatId,
  messageId,
  onRequestStarted,
}: {
  chatId: string;
  messageId: string;
  onRequestStarted: () => void;
}) {
  const dispatch = useAppDispatch();
  const suggestions = useAppSelector((state) =>
    selectChatSuggestions(state, chatId),
  );
  const labelId = useId();
  if (suggestions.length === 0) return null;
  return (
    <div
      className={styles.suggestedReplies}
      role="group"
      aria-labelledby={labelId}
    >
      <p id={labelId}>Можешь продолжить</p>
      {suggestions.map((text) => (
        <button
          key={text}
          type="button"
          className={`${styles.userBubble} ${styles.suggestedReply}`}
          onClick={() => {
            if (
              dispatch(sendMessage(chatId, { text, afterMessageId: messageId }))
            )
              onRequestStarted();
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

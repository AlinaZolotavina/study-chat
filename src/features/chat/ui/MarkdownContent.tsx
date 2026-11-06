import { memo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import { safeLinkHref } from './contentPolicy';
import styles from './ChatWorkspace.module.css';

const components: Components = {
  h1: 'h3',
  h2: 'h3',
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
};

export const MarkdownContent = memo(function MarkdownContent({
  text,
}: {
  text: string;
}) {
  return (
    <div className={styles.markdown}>
      <Markdown
        skipHtml
        disallowedElements={['img']}
        urlTransform={safeLinkHref}
        components={components}
      >
        {text}
      </Markdown>
    </div>
  );
});

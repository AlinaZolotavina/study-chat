type IconName =
  'plus' | 'send' | 'stop' | 'chat' | 'book' | 'down' | 'retry' | 'warning';

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  const paths: Record<Exclude<IconName, 'stop'>, string> = {
    plus: 'M10 4v12M4 10h12',
    send: 'M10 16V4m-5 5 5-5 5 5',
    chat: 'M4 3h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H8l-5 3V4a1 1 0 0 1 1-1Z',
    book: 'M10 5C8 3 5 3 2 4v12c3-1 6-1 8 1m0-12c2-2 5-2 8-1v12c-3-1-6-1-8 1V5Z',
    down: 'M10 4v12m-5-5 5 5 5-5',
    retry: 'M16 7a6 6 0 1 0 0 6M16 3v4h-4',
    warning: 'm10 2 8 15H2L10 2Zm0 5v4m0 3v.5',
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {name === 'stop' ? (
        <rect x="5" y="5" width="10" height="10" rx="1" />
      ) : (
        <path d={paths[name]} />
      )}
    </svg>
  );
}

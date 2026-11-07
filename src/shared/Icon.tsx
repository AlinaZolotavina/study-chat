type IconName =
  | 'plus'
  | 'send'
  | 'stop'
  | 'chat'
  | 'down'
  | 'retry'
  | 'warning'
  | 'sparkle'
  | 'info'
  | 'menu'
  | 'close'
  | 'trash'
  | 'copy'
  | 'check'
  | 'download'
  | 'panel_open'
  | 'panel_close'
  | 'chevron';

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  const paths: Record<Exclude<IconName, 'stop'>, string> = {
    plus: 'M10 4v12M4 10h12',
    send: 'm17 3-5 14-3-6-6-3 14-5ZM9 11l8-8',
    chat: 'M17 9c0 4-3 7-7 7-1 0-2 0-3-.5L3 17l1.5-4C4 12 3 11 3 9a7 7 0 1 1 14 0Z',
    down: 'M10 4v12m-5-5 5 5 5-5',
    retry: 'M16 7a6 6 0 1 0 0 6M16 3v4h-4',
    warning: 'm10 2 8 15H2L10 2Zm0 5v4m0 3v.5',
    sparkle:
      'M10 2C11.5 7 13 8.5 18 10c-5 1.5-6.5 3-8 8-1.5-5-3-6.5-8-8 5-1.5 6.5-3 8-8Z',
    info: 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM10 9v5m0-8v.1',
    menu: 'M3 5h14M3 10h14M3 15h14',
    close: 'm5 5 10 10M15 5 5 15',
    trash: 'M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6m4-6v6',
    copy: 'M7 6V3h10v11h-3M3 6h11v11H3V6Z',
    check: 'm4 10 4 4 8-8',
    download: 'M10 2v10m-4-4 4 4 4-4M3 13v4h14v-4',
    panel_open: 'M3 3h14v14H3V3Zm4 0v14m4-10 3 3-3 3',
    panel_close: 'M3 3h14v14H3V3Zm4 0v14m6-10-3 3 3 3',
    chevron: 'm6 8 4 4 4-4',
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill={name === 'sparkle' ? 'currentColor' : 'none'}
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

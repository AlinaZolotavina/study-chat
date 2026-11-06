import { isLocalImageSrc } from '../model/helpers';

export function safeLinkHref(value: string): string | undefined {
  if (!/^https?:\/\//iu.test(value)) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function localImageUrl(
  imageSrc: string,
  base: string,
): string | undefined {
  if (!isLocalImageSrc(imageSrc)) return undefined;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return prefix + imageSrc.split('/').map(encodeURIComponent).join('/');
}

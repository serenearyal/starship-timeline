// Pipeline photos: WebP in two sizes, a JPEG fallback and a blurred placeholder under the image.

import type { Photo, SiteData } from '../data/types.ts';
import { esc } from './format.ts';

interface PictureOptions {
  alt?: string;
  /** The `sizes` attribute: how wide the image shows on the page. */
  sizes?: string;
  /** Load at once with high priority (the hero). Everything else loads lazily. */
  eager?: boolean;
}

export function pictureHtml(photo: Photo, { alt = '', sizes = '100vw', eager = false }: PictureOptions = {}): string {
  // Sources smaller than 1200 px are never upscaled, so `small` can be as wide as `large`.
  const smallWidth = Math.min(1200, photo.width);
  const srcset = photo.small === photo.large ? `${photo.large} ${photo.width}w` : `${photo.small} ${smallWidth}w, ${photo.large} ${photo.width}w`;
  const loading = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<picture>
    <source type="image/webp" srcset="${esc(srcset)}" sizes="${esc(sizes)}">
    <img src="${esc(photo.jpeg)}" width="${photo.width}" height="${photo.height}" alt="${esc(alt)}" ${loading} decoding="async" style="background-image:url('${esc(photo.placeholder)}')">
  </picture>`;
}

export function creditText(photo: Photo): string {
  const by = photo.credit ? `Photo: ${photo.credit}` : 'Photo';
  return photo.license ? `${by}, ${photo.license}` : by;
}

/**
 * Each flown flight's own photo, by flight number. Launch Library reuses one image for several
 * flights (and for the next flight before it flies), so only the oldest flight with an image keeps it.
 */
export function ownPhotos(data: SiteData): Map<number, Photo> {
  const seen = new Set<string>();
  const result = new Map<number, Photo>();
  for (const f of data.flights) {
    if (f.upcoming || !f.photo || seen.has(f.photo.large)) continue;
    seen.add(f.photo.large);
    result.set(f.number, f.photo);
  }
  return result;
}

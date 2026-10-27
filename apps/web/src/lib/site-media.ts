import type { SiteAsset } from './sites-api';
export function missingSiteMedia(assets: SiteAsset[], locale?: string): string[] {
  const fr = locale === 'fr';
  const dated = (kind: string) =>
    assets.some((a) => a.kind === kind && a.mediaType === 'image' && !!a.capturedAt);
  const walkthrough =
    assets.some(
      (a) =>
        a.kind === 'site_video' &&
        a.mediaType === 'video' &&
        (a.durationSeconds ?? 0) > 0 &&
        a.durationSeconds! <= 60,
    ) ||
    assets.some(
      (a) =>
        a.kind === 'panorama' &&
        a.mediaType === 'image' &&
        (a.width ?? 0) > 0 &&
        (a.height ?? 0) > 0 &&
        Math.abs(a.width! - 2 * a.height!) <= 2,
    );
  return [
    !dated('wide')
      ? fr
        ? 'Ajoutez une photo en vue large avec sa date de prise de vue.'
        : 'Add a wide / long-view photo with its capture date.'
      : null,
    !dated('close_up')
      ? fr
        ? 'Ajoutez une photo en vue rapprochée avec sa date de prise de vue.'
        : 'Add a close-up / short-view photo with its capture date.'
      : null,
    !walkthrough
      ? fr
        ? 'Ajoutez une vidéo du site ou un panorama 360° complet.'
        : 'Add a site video or full 360° panorama.'
      : null,
  ].filter((v): v is string => !!v);
}
export function siteMediaLabel(kind: string, locale?: string): string {
  const fr = locale === 'fr';
  const labels: Record<string, [string, string]> = {
    wide: ['Wide / long view', 'Vue large'],
    close_up: ['Close-up / short view', 'Vue rapprochée'],
    panorama: ['360° panorama', 'Panorama 360°'],
    site_video: ['Site video', 'Vidéo du site'],
    board_video: ['LED board video', 'Vidéo du panneau LED'],
    front: ['Front photo', 'Photo de face'],
    context: ['Street context', 'Environnement'],
    night: ['Night photo', 'Photo de nuit'],
    diagram: ['Diagram', 'Schéma'],
  };
  return labels[kind]?.[fr ? 1 : 0] ?? kind;
}

export interface RequiredSiteMedia {
  kind: string;
  mediaType?: string;
  capturedAt?: Date | string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
}
export function siteMediaProblems(assets: RequiredSiteMedia[], version = 2): string[] {
  if (version < 2)
    return assets.some((a) => a.kind === 'front' && a.capturedAt)
      ? []
      : ['a front-on reference photo with a known capture date is required'];
  const photo = (kind: string) =>
    assets.some((a) => a.kind === kind && a.mediaType === 'image' && !!a.capturedAt);
  const panorama = assets.some(
    (a) =>
      a.kind === 'panorama' &&
      a.mediaType === 'image' &&
      (a.width ?? 0) > 0 &&
      (a.height ?? 0) > 0 &&
      Math.abs(a.width! - 2 * a.height!) <= 2,
  );
  const video = assets.some(
    (a) =>
      a.kind === 'site_video' &&
      a.mediaType === 'video' &&
      (a.durationSeconds ?? 0) > 0 &&
      a.durationSeconds! <= 60,
  );
  return [
    !photo('wide') ? 'a wide / long-view photo with a known capture date is required' : null,
    !photo('close_up')
      ? 'a close-up / short-view photo with a known capture date is required'
      : null,
    !(panorama || video) ? 'a site video or full 360° panorama is required' : null,
  ].filter((v): v is string => !!v);
}
export function siteMediaEligibilitySql(sitePrefix: string): string {
  const exists = (predicate: string) =>
    `EXISTS (SELECT 1 FROM site_assets a WHERE a.site_id = ${sitePrefix}id::text AND ${predicate})`;
  const photo = (kind: string) =>
    exists(`a.kind = '${kind}' AND a.media_type = 'image' AND a.captured_at IS NOT NULL`);
  return `(CASE WHEN ${sitePrefix}media_requirements_version < 2 THEN ${exists("a.kind = 'front' AND a.captured_at IS NOT NULL")} ELSE (${photo('wide')} AND ${photo('close_up')} AND (${exists("a.kind = 'panorama' AND a.media_type = 'image' AND a.width > 0 AND a.height > 0 AND abs(a.width - 2 * a.height) <= 2")} OR ${exists("a.kind = 'site_video' AND a.media_type = 'video' AND a.duration_seconds > 0 AND a.duration_seconds <= 60")})) END)`;
}

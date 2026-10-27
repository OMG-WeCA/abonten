'use client';

import type { SiteAsset } from '../../lib/sites-api';
import type { PendingSiteMedia } from './MediaCapturePicker';

/** Framing illustrations, deliberately distinct from evidence uploaded by a partner. */
function Framing({ close = false, fr = false }: { close?: boolean; fr?: boolean }) {
  return (
    <svg
      viewBox={close ? '190 28 225 145' : '0 0 600 260'}
      role="img"
      aria-label={
        close
          ? fr
            ? 'Vue rapprochée du panneau entier'
            : 'Close-up framing of the entire board'
          : fr
            ? 'Vue large du panneau, de la route et des alentours'
            : 'Wide framing with the board, road and surroundings'
      }
      className="aspect-[16/9] w-full rounded-lg bg-info/10"
    >
      <rect x="0" y="0" width="600" height="260" className="fill-info/10" />
      <path
        d="M0 145L90 115 170 150 290 110 420 143 510 117 600 146V260H0Z"
        className="fill-success/20"
      />
      <path d="M0 190L600 165V260H0Z" className="fill-muted/40" />
      <path
        d="M0 239L600 199"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="28 20"
        className="text-surface-2"
      />
      <g className="fill-muted/50">
        <rect x="32" y="108" width="63" height="73" />
        <rect x="465" y="96" width="84" height="78" />
        <rect x="102" y="131" width="45" height="47" />
      </g>
      <g className="fill-surface-2/70">
        <rect x="44" y="120" width="12" height="17" />
        <rect x="69" y="120" width="12" height="17" />
        <rect x="478" y="109" width="16" height="20" />
        <rect x="516" y="109" width="16" height="20" />
      </g>
      <path
        d="M292 139V185M310 139V183"
        stroke="currentColor"
        strokeWidth="8"
        className="text-muted"
      />
      <rect x="204" y="42" width="196" height="102" rx="3" className="fill-foreground" />
      <rect x="210" y="48" width="184" height="90" className="fill-surface-2" />
      <path d="M210 110L270 68 328 117 359 88 394 111V138H210Z" className="fill-primary/30" />
      <circle cx="362" cy="72" r="12" className="fill-primary" />
      <path
        d={
          close
            ? 'M198 53V36H219M385 36H406V53M406 132V150H385M219 150H198V132'
            : 'M15 38V15H44M556 15H585V38M585 222V245H556M44 245H15V222'
        }
        fill="none"
        stroke="currentColor"
        strokeWidth={close ? 2 : 3}
        className="text-primary"
      />
    </svg>
  );
}
export function SiteCaptureGuide({
  value,
  existing = [],
  locale,
  onChoose,
}: {
  value: PendingSiteMedia[];
  existing?: SiteAsset[];
  locale?: string;
  onChoose: (kind: PendingSiteMedia['kind']) => void;
}) {
  const fr = locale === 'fr';
  const has = (kind: string) =>
    value.some((a) => a.kind === kind) || existing.some((a) => a.kind === kind);
  const items: [PendingSiteMedia['kind'], string, string, boolean][] = [
    [
      'wide',
      fr ? '1. Vue large' : '1. Wide / long view',
      fr
        ? 'Montrez le panneau, la route d’approche et les alentours dans la même photo.'
        : 'Show the board, the approach road and the surroundings in one photo.',
      has('wide'),
    ],
    [
      'close_up',
      fr ? '2. Vue rapprochée' : '2. Close-up / short view',
      fr
        ? 'Cadrez le panneau entier, avec ses bords et son support bien visibles.'
        : 'Frame the whole board clearly, including its edges and supporting structure.',
      has('close_up'),
    ],
  ];
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold">
          {fr ? 'Montrez le site sous trois angles' : 'Show the site in three ways'}
        </h3>
        <p className="mt-1 text-sm leading-6 text-muted">
          {fr
            ? 'Les deux photos et une vidéo ou un panorama sont requis avant l’envoi en revue. Vous pouvez enregistrer un brouillon et revenir plus tard.'
            : 'Both photos and a video or panorama are required before review. You can save a draft and come back later.'}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map(([kind, title, description, added]) => (
          <div key={kind} className="rounded-xl border border-border bg-surface-2 p-3">
            <Framing close={kind === 'close_up'} fr={fr} />
            <div className="mt-3 flex items-start justify-between gap-2">
              <h4 className="font-semibold">{title}</h4>
              <span className={`text-xs font-semibold ${added ? 'text-success' : 'text-muted'}`}>
                {added ? (fr ? 'Ajoutée' : 'Added') : fr ? 'Requise' : 'Required'}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
            <button
              type="button"
              onClick={() => onChoose(kind)}
              className="mt-2 min-h-11 text-sm font-bold text-primary"
            >
              {fr ? 'Ajouter cette photo' : 'Add this photo'} →
            </button>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h4 className="font-semibold">
            {fr ? '3. Vidéo ou panorama 360°' : '3. Video or 360° panorama'}
          </h4>
          <span
            className={`shrink-0 text-xs font-semibold ${has('site_video') || has('panorama') ? 'text-success' : 'text-muted'}`}
          >
            {has('site_video') || has('panorama')
              ? fr
                ? 'Ajouté'
                : 'Added'
              : fr
                ? 'Un des deux requis'
                : 'Choose at least one'}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">
          {fr
            ? 'Le plus simple : filmez lentement le panneau et ses alentours depuis un endroit sûr. Une seule vidéo suffit. Si vous disposez d’une photo 360°, vous pouvez l’utiliser à la place.'
            : 'The simplest option: slowly film the board and its surroundings from a safe position. One video is enough. If you have a 360° photo, you can use that instead.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onChoose('site_video')}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white"
          >
            {fr ? 'Ajouter une vidéo' : 'Add a video'}
          </button>
          <button
            type="button"
            onClick={() => onChoose('panorama')}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold"
          >
            {fr ? 'Ajouter un panorama 360°' : 'Add a 360° panorama'}
          </button>
        </div>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-muted">
            {fr ? 'Comment cadrer la vidéo ?' : 'How should I frame the video?'}
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 leading-6 text-muted">
            <li>
              {fr
                ? 'Commencez par une vue large du site et de la route.'
                : 'Start with a wide view of the site and approach road.'}
            </li>
            <li>
              {fr
                ? 'Tournez lentement vers le panneau et maintenez-le dans le cadre.'
                : 'Pan slowly towards the board and hold it clearly in frame.'}
            </li>
            <li>
              {fr
                ? 'Terminez avec les alentours visibles. Pas de fichier publicitaire.'
                : 'Finish with the surroundings visible. Upload the real site, not an ad creative.'}
            </li>
          </ol>
        </details>
      </div>
      <p className="text-xs leading-5 text-muted">
        {fr
          ? 'Illustrations de cadrage. Utilisez vos propres photos et indiquez leur date réelle de prise de vue si elle n’est pas intégrée.'
          : 'Framing illustrations. Upload your own photos and provide their actual capture date if it is not embedded.'}
      </p>
    </div>
  );
}

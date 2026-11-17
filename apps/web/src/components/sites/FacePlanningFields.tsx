'use client';

import type { FacePlanningProfile, SiteDetail } from '../../lib/sites-api';
import { RegistrationMap } from './RegistrationMap';
import { inputClass } from './sites-ui';

export function FacePlanningFields({
  value,
  onChange,
  site,
  locale,
}: {
  value: FacePlanningProfile | null;
  onChange: (value: FacePlanningProfile | null) => void;
  site: Pick<SiteDetail, 'latitude' | 'longitude' | 'country'>;
  locale: string | undefined;
}) {
  const fr = locale === 'fr';
  const source = 'Media partner';
  const method =
    'Partner-declared from map and site knowledge; facing and distance estimated from selected road viewpoint or corrected from site knowledge; viewing angle and minimum time are planning requirements';
  const patch = (changes: Partial<FacePlanningProfile>) => {
    if (value)
      onChange({ ...value, ...changes, source, method, collectedAt: new Date().toISOString() });
  };
  if (!value)
    return (
      <div className="rounded-lg border border-border p-3">
        <button
          type="button"
          onClick={() =>
            onChange({
              viewingAngleDeg: 120,
              minimumViewSeconds: 2,
              obstruction: 'unknown',
              displaySchedule: { startHour: 0, endHour: 24 },
              source,
              method,
              collectedAt: new Date().toISOString(),
            })
          }
          className="min-h-10 text-sm font-semibold text-primary"
        >
          {fr ? 'Ajouter les conditions de visibilité' : 'Add viewing details'}
        </button>
        <p className="text-xs text-muted">
          {fr
            ? 'Enregistrez-les une fois pour les prochaines études.'
            : 'Save these once for future planning studies.'}
        </p>
      </div>
    );

  const numeric = (
    field: 'facingDeg' | 'viewingDistanceMetres' | 'viewingAngleDeg' | 'minimumViewSeconds',
    label: string,
    min: number,
    max?: number,
  ) => (
    <label className="block text-xs font-semibold">
      {label}
      <input
        type="number"
        value={value[field] ?? ''}
        min={min}
        max={max}
        step="any"
        onChange={(event) =>
          patch({ [field]: event.target.value === '' ? undefined : Number(event.target.value) })
        }
        className={`${inputClass} mt-1`}
      />
    </label>
  );

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-bold">
        {fr ? 'Visibilité de cette face' : 'Visibility of this face'}
      </legend>
      <p className="text-xs leading-5 text-muted">
        {fr
          ? 'Cliquez sur le point routier le plus éloigné depuis lequel cette face est visible. Vérifiez son orientation. Ces informations sont déclarées par votre organisation.'
          : 'Select the furthest road point from which this face can be seen, then check its facing direction. Your organisation declares these details.'}
      </p>
      <RegistrationMap
        latitude={value.sightline ? String(value.sightline.latitude) : ''}
        longitude={value.sightline ? String(value.sightline.longitude) : ''}
        country={site.country}
        locale={fr ? 'fr' : 'en'}
        anchor={{ latitude: site.latitude, longitude: site.longitude }}
        bearingDeg={value.facingDeg}
        ariaLabel={
          fr ? 'Choisir le point de visibilité de la face' : 'Choose the face’s road viewpoint'
        }
        hint={
          fr
            ? 'La flèche indique la face. Cliquez sur la route visible.'
            : 'The arrow marks the face. Select its visible road approach.'
        }
        onPick={(lat, lng) => {
          const latitude = Number(lat),
            longitude = Number(lng);
          const toRad = Math.PI / 180;
          const a = site.latitude * toRad,
            b = latitude * toRad,
            d = (longitude - site.longitude) * toRad;
          const bearing =
            (Math.atan2(
              Math.sin(d) * Math.cos(b),
              Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(d),
            ) /
              toRad +
              360) %
            360;
          const hav = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(d / 2) ** 2;
          const distance =
            6371000 * 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(Math.max(0, 1 - hav)));
          patch({
            sightline: { latitude, longitude },
            ...(value.facingDeg === undefined ? { facingDeg: Math.round(bearing) % 360 } : {}),
            viewingDistanceMetres: Math.max(1, Math.round(distance)),
          });
        }}
      />
      <details className="rounded border border-border p-3">
        <summary className="cursor-pointer text-xs font-semibold">
          {fr ? 'Route à analyser' : 'Road used for analysis'} ·{' '}
          {value.roadApproach
            ? fr
              ? 'Route sélectionnée'
              : 'Selected road'
            : fr
              ? 'Route cartographiée la plus proche'
              : 'Nearest mapped road'}
        </summary>
        <p className="my-2 text-xs text-muted">
          {fr
            ? 'Si cette face donne sur une autre route, sélectionnez cette route près du panneau. Le point ci-dessus définit la distance visible.'
            : 'If this face serves another road, select that road near the board. The viewpoint above sets the visible distance.'}
        </p>
        <RegistrationMap
          latitude={value.roadApproach ? String(value.roadApproach.latitude) : ''}
          longitude={value.roadApproach ? String(value.roadApproach.longitude) : ''}
          country={site.country}
          locale={fr ? 'fr' : 'en'}
          anchor={{ latitude: site.latitude, longitude: site.longitude }}
          ariaLabel={fr ? 'Choisir la route à analyser' : 'Choose the road used for analysis'}
          hint={fr ? 'Sélectionnez la route près du panneau.' : 'Select the road beside the board.'}
          onPick={(latitude, longitude) =>
            patch({ roadApproach: { latitude: Number(latitude), longitude: Number(longitude) } })
          }
        />
        {value.roadApproach && (
          <button
            type="button"
            className="mt-2 min-h-10 text-xs text-primary underline"
            onClick={() => patch({ roadApproach: undefined })}
          >
            {fr ? 'Utiliser la route la plus proche' : 'Use nearest mapped road'}
          </button>
        )}
      </details>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold">
          {fr ? 'Orientation de la face' : 'Face points toward'}
          <div
            className="mt-1 flex flex-wrap gap-1"
            role="group"
            aria-label={fr ? 'Boussole' : 'Compass'}
          >
            {['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((direction, index) => (
              <button
                key={direction}
                type="button"
                aria-pressed={value.facingDeg === index * 45}
                onClick={() => patch({ facingDeg: index * 45 })}
                className={`min-h-10 min-w-10 rounded border px-2 text-xs ${value.facingDeg === index * 45 ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}
              >
                {fr ? direction.replace('W', 'O') : direction}
              </button>
            ))}
          </div>
        </label>
        {numeric('facingDeg', fr ? 'Orientation précise (°)' : 'Exact facing (°)', 0, 359)}
        {numeric('viewingDistanceMetres', fr ? 'Distance visible (m)' : 'Visible distance (m)', 1)}
        <label className="block text-xs font-semibold">
          {fr ? 'Obstacles dans la vue' : 'Obstructions in the view'}
          <select
            value={value.obstruction ?? 'unknown'}
            onChange={(event) =>
              patch({ obstruction: event.target.value as FacePlanningProfile['obstruction'] })
            }
            className={`${inputClass} mt-1`}
          >
            <option value="unknown">{fr ? 'À préciser' : 'To confirm'}</option>
            <option value="clear">{fr ? 'Vue dégagée' : 'Clear view'}</option>
            <option value="partial">{fr ? 'Partiellement masquée' : 'Partly obstructed'}</option>
            <option value="blocked">{fr ? 'Vue bloquée' : 'Blocked view'}</option>
          </select>
        </label>
      </div>
      <details className="rounded border border-border p-3">
        <summary className="cursor-pointer text-xs font-semibold">
          {fr ? 'Critères de visibilité et horaires' : 'Viewing requirements and hours'} ·{' '}
          {value.viewingAngleDeg ?? '—'}° · {value.minimumViewSeconds ?? '—'} s
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {numeric('viewingAngleDeg', fr ? 'Cône de visibilité (°)' : 'Viewing cone (°)', 1, 180)}
          {numeric(
            'minimumViewSeconds',
            fr ? 'Durée minimale visible (s)' : 'Minimum time in view (s)',
            0.1,
          )}
          {(['displaySchedule', 'illuminationSchedule'] as const).map((key) => (
            <div key={key} className="space-y-2">
              <label className="flex min-h-10 items-center gap-2 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={Boolean(value[key])}
                  onChange={(event) =>
                    patch({
                      [key]: event.target.checked ? { startHour: 0, endHour: 24 } : undefined,
                    })
                  }
                  className="accent-primary"
                />
                {key === 'displaySchedule'
                  ? fr
                    ? 'Heures d’affichage quotidiennes'
                    : 'Daily display hours'
                  : fr
                    ? 'Heures d’éclairage quotidiennes'
                    : 'Daily illumination hours'}
              </label>
              {value[key] && (
                <div className="grid grid-cols-2 gap-2">
                  {(['startHour', 'endHour'] as const).map((hour) => (
                    <label key={hour} className="text-xs text-muted">
                      {hour === 'startHour'
                        ? fr
                          ? 'Début (0–24)'
                          : 'From (0–24)'
                        : fr
                          ? 'Fin (0–24)'
                          : 'Until (0–24)'}
                      <input
                        type="number"
                        min="0"
                        max="24"
                        step="0.5"
                        value={value[key]![hour]}
                        onChange={(event) =>
                          patch({ [key]: { ...value[key]!, [hour]: Number(event.target.value) } })
                        }
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {fr
            ? 'Heures locales. Par exemple, 18 à 6 couvre la nuit.'
            : 'Use local hours. For example, 18 to 6 covers overnight.'}
        </p>
      </details>
      <button
        type="button"
        className="min-h-10 text-xs text-muted underline"
        onClick={() => onChange(null)}
      >
        {fr ? 'Retirer les conditions de visibilité' : 'Remove viewing details'}
      </button>
    </fieldset>
  );
}

import { useEffect, useState } from 'react';
import type { PlanningFitPreferences } from '@abonten/contracts/planning-draft';

export function BriefFitPreferences({
  value,
  onChange,
  locale,
  disabled = false,
}: {
  value?: PlanningFitPreferences;
  onChange: (value: PlanningFitPreferences) => void;
  locale: 'en' | 'fr';
  disabled?: boolean;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const [areas, setAreas] = useState('');
  const [corridors, setCorridors] = useState('');
  const [audience, setAudience] = useState('');
  const [direction, setDirection] = useState('');
  const [daypart, setDaypart] = useState<NonNullable<PlanningFitPreferences['daypart']>>('any');
  const [goal, setGoal] = useState<NonNullable<PlanningFitPreferences['goal']>>('balanced');
  const [error, setError] = useState('');
  useEffect(() => {
    setAreas(value?.targetAreas?.join(', ') ?? '');
    setCorridors(value?.targetCorridors?.join(', ') ?? '');
    setAudience(value?.audienceTags?.join(', ') ?? '');
    setDirection(value?.approachDirection ?? '');
    setDaypart(value?.daypart ?? 'any');
    setGoal(value?.goal ?? 'balanced');
    setError('');
  }, [value]);
  const apply = () => {
    const values = [areas, corridors, audience].map((text) => [
      ...new Map(
        text
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => [item.toLocaleLowerCase('en'), item]),
      ).values(),
    ]);
    if (values.some((items) => items.length > 8 || items.some((item) => item.length > 80))) {
      setError(
        t(
          'Use up to 8 names per field, each under 80 characters.',
          'Utilisez au maximum 8 noms par champ, de moins de 80 caractères chacun.',
        ),
      );
      return;
    }
    setError('');
    onChange({
      version: 1,
      targetAreas: values[0],
      targetCorridors: values[1],
      audienceTags: values[2],
      daypart,
      goal,
      ...(direction
        ? { approachDirection: direction as PlanningFitPreferences['approachDirection'] }
        : {}),
    });
  };
  return (
    <details className="agency-fit-preferences" data-testid="brief-fit-preferences">
      <summary>
        {t('Brief priorities', 'Priorités du brief')}{' '}
        <span>{value ? t('Confirmed', 'Confirmées') : t('Optional', 'Facultatives')}</span>
      </summary>
      <p>
        {t(
          'Confirm priorities before scoring. Exact sourced area, corridor and audience labels are matched; missing evidence stays unknown.',
          'Confirmez les priorités avant de noter. Les noms de zones, axes et audiences sont comparés aux sources ; les données absentes restent inconnues.',
        )}
      </p>
      <label className="agency-field">
        <span>
          {t('Target areas · comma separated', 'Zones cibles · séparées par des virgules')}
        </span>
        <input
          value={areas}
          maxLength={648}
          disabled={disabled}
          onChange={(event) => setAreas(event.target.value)}
        />
      </label>
      <label className="agency-field">
        <span>{t('Target corridors', 'Axes cibles')}</span>
        <input
          value={corridors}
          maxLength={648}
          disabled={disabled}
          onChange={(event) => setCorridors(event.target.value)}
        />
      </label>
      <label className="agency-field">
        <span>{t('Audience segments', 'Segments d’audience')}</span>
        <input
          value={audience}
          maxLength={648}
          disabled={disabled}
          onChange={(event) => setAudience(event.target.value)}
        />
      </label>
      <div className="agency-fit-control-row">
        <label className="agency-field">
          <span>{t('Travel approach', 'Sens d’approche')}</span>
          <select
            value={direction}
            disabled={disabled}
            onChange={(event) => setDirection(event.target.value)}
          >
            <option value="">{t('Unspecified', 'Non précisé')}</option>
            {['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="agency-field">
          <span>{t('Daypart', 'Moment')}</span>
          <select
            value={daypart}
            disabled={disabled}
            onChange={(event) => setDaypart(event.target.value as typeof daypart)}
          >
            <option value="any">{t('Any time', 'Toute la journée')}</option>
            <option value="day">{t('Day', 'Jour')}</option>
            <option value="night">{t('Night', 'Nuit')}</option>
          </select>
        </label>
      </div>
      <label className="agency-field">
        <span>{t('Planning goal', 'Objectif')}</span>
        <select
          value={goal}
          disabled={disabled}
          onChange={(event) => setGoal(event.target.value as typeof goal)}
        >
          <option value="balanced">{t('Balanced fit', 'Pertinence équilibrée')}</option>
          <option value="coverage">{t('Geographic variety', 'Diversité géographique')}</option>
          <option value="value">{t('Fit for media spend', 'Pertinence par coût média')}</option>
        </select>
      </label>
      <button className="agency-secondary-button" disabled={disabled} onClick={apply}>
        {t('Apply priorities', 'Appliquer les priorités')}
      </button>
      {error && (
        <p role="alert" className="agency-form-error">
          {error}
        </p>
      )}
    </details>
  );
}

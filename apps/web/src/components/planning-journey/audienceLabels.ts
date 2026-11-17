import type { PlanningStudyTarget } from '@abonten/contracts/planning-study';

export const AGE_BANDS = Array.from({ length: 16 }, (_, i) => `${i * 5}_${i * 5 + 4}`).concat(
  '80_plus',
);
export function ageLabel(bands: string[]) {
  const indices = bands.map((value) => AGE_BANDS.indexOf(value)).sort((a, b) => a - b);
  if (
    indices.length &&
    indices[0] >= 0 &&
    indices.every((value, i) => i === 0 || value === indices[i - 1] + 1)
  ) {
    if (bands.length === 1 && bands[0] === '80_plus') return '80+';
    return `${AGE_BANDS[indices[0]].split('_')[0]}–${AGE_BANDS[indices[indices.length - 1]].replace('80_plus', '80+').split('_').pop()}`;
  }
  return bands.map((value) => value.replace('_plus', '+').replace('_', '–')).join(', ');
}
export function audienceLabels(target: PlanningStudyTarget, locale: 'en' | 'fr') {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const parent = target.household?.parentsOfSchoolChildren;
  const labels = [
    parent ? t('Parents with schoolchildren', 'Parents d’enfants scolarisés') : '',
    parent?.childAgeMin !== undefined && parent.childAgeMax !== undefined
      ? t(
          `School ages ${parent.childAgeMin}–${parent.childAgeMax}`,
          `Âges scolaires ${parent.childAgeMin}–${parent.childAgeMax}`,
        )
      : '',
    parent?.schoolLocation ? t('Schools in target area', 'Écoles dans la zone ciblée') : '',
    target.ageBands?.length ? ageLabel(target.ageBands) : '',
    target.sex ? (target.sex === 'female' ? t('Female', 'Femmes') : t('Male', 'Hommes')) : '',
    target.sec?.groups.length ? `SEC ${target.sec.groups.join(' / ')}` : '',
    target.locations?.length
      ? `${t('Resident zones', 'Zones de résidence')} ${target.locations.join(' / ')}`
      : '',
    target.travelPurposes
      ?.map(
        (value) =>
          (
            ({
              business: ['Work', 'Travail'],
              education: ['Education', 'Études'],
              shopping: ['Shopping', 'Achats'],
              food_and_drink: ['Food', 'Restauration'],
              healthcare: ['Healthcare', 'Santé'],
              transport: ['Transport', 'Transport'],
              leisure: ['Leisure', 'Loisirs'],
              tourism: ['Tourism', 'Tourisme'],
              religious: ['Worship', 'Culte'],
            }) as Record<string, string[]>
          )[value]?.[locale === 'fr' ? 1 : 0] ?? value,
      )
      .join(' / ') ?? '',
    target.unsupportedCriteria?.length || target.household?.economicDescription
      ? t('Additional requirements', 'Critères supplémentaires')
      : '',
  ].filter(Boolean);
  return labels.length ? labels : [t('All modeled people', 'Toutes les personnes modélisées')];
}

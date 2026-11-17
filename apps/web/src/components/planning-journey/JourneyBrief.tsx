'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Check, Upload, X } from 'lucide-react';
import type {
  PlanningBriefFieldsResult,
  PlanningCampaignFieldPatch,
  PlanningCampaignTargetPatch,
  PlanningJourneyContext,
  PlanningSecGroup,
  PlanningTargetGroup,
} from '@abonten/contracts/planning-study';
import { PARENT_EXCLUSION_REQUIREMENT, type AgencyDraft } from '../../lib/agency-draft';
import { apiJson, ApiError } from '../../lib/api';
import { extractBrief } from '../../lib/agency-api';
import {
  PLANNING_CURRENCIES,
  planningLastDay,
  planningExclusiveEnd,
} from '../../lib/agency-planning';
import { planningInputSignature } from '../../lib/planning-work-session';
import { findMarket, SUPPORTED_MARKETS } from '../../lib/markets';
import { AGE_BANDS, ageLabel } from './audienceLabels';
import { STUDY_DAYPARTS } from './planningStudyBasis';
import { DEFAULT_MODEL_CONTROLS } from './usePlanningStudy';

const SEC: PlanningSecGroup[] = ['A', 'B', 'C1', 'C2', 'D', 'E'];
const emptyTarget = (): PlanningTargetGroup => ({ description: '', rationale: '', criteria: {} });
const context = (draft: AgencyDraft): PlanningJourneyContext =>
  draft.planning ?? {
    version: 1,
    brief: { summary: '' },
    targetGroup: {
      ...emptyTarget(),
      description: draft.audiencePlan?.targetAudience ?? '',
      criteria: draft.modelControls?.target ?? {},
    },
    strategy: { summary: '', rationale: '' },
    origin: 'manual',
  };
function withPlanning(draft: AgencyDraft, planning: PlanningJourneyContext): AgencyDraft {
  return {
    ...draft,
    planning,
    audiencePlan: {
      targetAudience: '',
      objective: 'reach',
      minimumOpportunities: '4',
      ...draft.audiencePlan,
      ...(planning.strategy.objective ? { objective: planning.strategy.objective } : {}),
      ...(planning.strategy.minimumOpportunities
        ? { minimumOpportunities: String(planning.strategy.minimumOpportunities) }
        : {}),
    },
    modelControls: {
      ...DEFAULT_MODEL_CONTROLS,
      ...draft.modelControls,
      target: planning.targetGroup.criteria,
      secondaryTarget: planning.secondaryTargetGroup?.criteria,
      ...(planning.strategy.geography
        ? {
            center: planning.strategy.geography.center,
            radiusKm: planning.strategy.geography.radiusKm,
          }
        : {}),
    },
  };
}
function targetPatch(
  current: PlanningTargetGroup,
  patch: PlanningCampaignTargetPatch,
): PlanningTargetGroup {
  const { description, parentsOfSchoolChildren, sex, unsupportedCriteria, ...criteria } = patch;
  const replacesParentRestriction =
    parentsOfSchoolChildren !== undefined &&
    (parentsOfSchoolChildren !== null ||
      !unsupportedCriteria?.includes(PARENT_EXCLUSION_REQUIREMENT));
  const requirements = [
    ...new Set([
      ...(current.criteria.unsupportedCriteria ?? []).filter(
        (requirement) => !replacesParentRestriction || requirement !== PARENT_EXCLUSION_REQUIREMENT,
      ),
      ...(unsupportedCriteria ?? []),
    ]),
  ];
  return {
    ...current,
    ...(description !== undefined ? { description } : {}),
    criteria: {
      ...current.criteria,
      ...criteria,
      unsupportedCriteria: requirements,
      ...(sex !== undefined ? { sex: sex ?? undefined } : {}),
      ...(parentsOfSchoolChildren !== undefined
        ? {
            household: {
              ...current.criteria.household,
              parentsOfSchoolChildren:
                parentsOfSchoolChildren === null
                  ? undefined
                  : {
                      ...current.criteria.household?.parentsOfSchoolChildren,
                      ...parentsOfSchoolChildren,
                    },
            },
          }
        : {}),
    },
  };
}
function fillFields(draft: AgencyDraft, fields: PlanningCampaignFieldPatch): AgencyDraft {
  let next = draft;
  const planning = context(draft);
  const market = fields.countryCode ? findMarket(fields.countryCode) : undefined;
  const changedMarket = market && market.code !== draft.country;
  if (changedMarket)
    next = {
      ...next,
      country: market.code,
      currency: market.currency,
      modelControls: {
        ...DEFAULT_MODEL_CONTROLS,
        ...draft.modelControls,
        center: undefined,
        studyId: undefined,
      },
    };
  const resetArea = (group: PlanningTargetGroup): PlanningTargetGroup => {
    if (!changedMarket) return group;
    const parent = group.criteria.household?.parentsOfSchoolChildren;
    return {
      ...group,
      criteria: {
        ...group.criteria,
        locations: [],
        ...(parent
          ? {
              household: {
                ...group.criteria.household,
                parentsOfSchoolChildren: {
                  ...parent,
                  ...(parent.schoolLocation ? { schoolLocation: { scope: 'study_area' } } : {}),
                },
              },
            }
          : {}),
      },
    };
  };
  const primary = fields.primaryTargetGroup
    ? targetPatch(resetArea(planning.targetGroup), fields.primaryTargetGroup)
    : resetArea(planning.targetGroup);
  const secondary =
    fields.secondaryTargetGroup === null
      ? undefined
      : fields.secondaryTargetGroup
        ? targetPatch(
            resetArea(planning.secondaryTargetGroup ?? emptyTarget()),
            fields.secondaryTargetGroup,
          )
        : planning.secondaryTargetGroup
          ? resetArea(planning.secondaryTargetGroup)
          : undefined;
  const strategy = {
    ...planning.strategy,
    ...(changedMarket ? { geography: undefined } : {}),
    ...(fields.objective ? { objective: fields.objective } : {}),
    ...(fields.minimumOpportunities ? { minimumOpportunities: fields.minimumOpportunities } : {}),
    ...(fields.daypartIds
      ? { dayparts: STUDY_DAYPARTS.filter((p) => fields.daypartIds!.includes(p.id)) }
      : {}),
  };
  return withPlanning(
    {
      ...next,
      ...(fields.primaryTargetGroup &&
      Object.keys(fields.primaryTargetGroup).some((key) => key !== 'description') &&
      next.audiencePlan
        ? { audiencePlan: { ...next.audiencePlan, targetAudience: '' } }
        : {}),
      ...(fields.budget?.amount !== undefined ? { budget: String(fields.budget.amount) } : {}),
      ...(fields.budget?.currency ? { currency: fields.budget.currency } : {}),
      ...(fields.flight ? { window: { ...next.window, ...fields.flight } } : {}),
    },
    {
      ...planning,
      ...(fields.description !== undefined ? { brief: { summary: fields.description } } : {}),
      targetGroup: primary,
      secondaryTargetGroup: secondary,
      strategy,
      origin: 'manual',
    },
  );
}
export function JourneyBrief({
  orgId,
  locale,
  draft,
  onChange,
  onMarket,
  minimumOpportunities,
  onMinimumOpportunities,
}: {
  orgId: string;
  locale: 'en' | 'fr';
  draft: AgencyDraft;
  onChange: Dispatch<SetStateAction<AgencyDraft>>;
  onMarket: (country: string) => void;
  minimumOpportunities: string;
  onMinimumOpportunities: (value: string) => void;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const planning = context(draft);
  const offer = planning.brief.offer?.trim();
  const description =
    offer && !planning.brief.summary.includes(offer)
      ? [planning.brief.summary, offer].filter(Boolean).join('\n\n')
      : planning.brief.summary;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState<(PlanningBriefFieldsResult & { signature: string }) | null>(
    null,
  );
  const [filled, setFilled] = useState<{
    previous: AgencyDraft;
    previousMinimum: string;
    signature: string;
    fields: string[];
    notes: string[];
  } | null>(null);
  const active = useRef<AbortController | null>(null);
  const signature = planningInputSignature([draft, minimumOpportunities]);
  const inputSignature = useRef(signature);
  inputSignature.current = signature;
  const visibleMinimum = useRef(minimumOpportunities);
  visibleMinimum.current = minimumOpportunities;
  const current = useRef(draft);
  current.current = draft;
  useEffect(() => () => active.current?.abort(), []);
  const update = (change: Partial<PlanningJourneyContext>) =>
    onChange((value) => withPlanning(value, { ...context(value), ...change, origin: 'manual' }));
  const updateGroup = (
    role: 'primary' | 'secondary',
    value: PlanningTargetGroup,
    replacesCriteria = false,
  ) =>
    onChange((draft) =>
      withPlanning(
        role === 'primary' && replacesCriteria && draft.audiencePlan
          ? { ...draft, audiencePlan: { ...draft.audiencePlan, targetAudience: '' } }
          : draft,
        {
          ...context(draft),
          ...(role === 'primary' ? { targetGroup: value } : { secondaryTargetGroup: value }),
          origin: 'manual',
        },
      ),
    );
  const applyFields = (result: PlanningBriefFieldsResult) => {
    if (!Object.keys(result.fields).length) {
      setError(
        t(
          'No campaign details found. Fill the form below.',
          'Aucun détail de campagne trouvé. Remplissez le formulaire.',
        ),
      );
      return;
    }
    const previous = current.current;
    const next = fillFields(previous, result.fields);
    const previousMinimum = visibleMinimum.current;
    const nextMinimum =
      result.fields.minimumOpportunities === undefined
        ? previousMinimum
        : String(result.fields.minimumOpportunities);
    onChange(next);
    if (result.fields.minimumOpportunities !== undefined) onMinimumOpportunities(nextMinimum);
    setReview(null);
    setFilled({
      previous,
      previousMinimum,
      signature: planningInputSignature([next, nextMinimum]),
      fields: Object.keys(result.fields),
      notes: result.notes,
    });
  };
  async function upload(file: File) {
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    const before = inputSignature.current;
    const countryCode = current.current.country;
    setBusy(true);
    setError('');
    setReview(null);
    try {
      const parsed = await extractBrief(orgId, file, controller.signal);
      if (controller.signal.aborted) return;
      const result = await apiJson<PlanningBriefFieldsResult>('/api/planning/v1/extract-brief', {
        method: 'POST',
        headers: { 'X-Org-Id': orgId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, countryCode, briefText: parsed.text }),
        signal: controller.signal,
        timeoutMs: 60_000,
      });
      if (controller.signal.aborted) return;
      const atTextLimit = parsed.text.length >= 60_000;
      const reviewed = {
        ...result,
        notes: [...(atTextLimit ? parsed.warnings : []), ...result.notes],
      };
      if (!atTextLimit && inputSignature.current === before) applyFields(reviewed);
      else setReview({ ...reviewed, signature: inputSignature.current });
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof ApiError
            ? error.message
            : t(
                'Could not fill the form. Your edits are kept.',
                'Impossible de remplir le formulaire. Vos modifications sont conservées.',
              ),
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  const fieldLabel = (key: string) =>
    ({
      description: t('Description', 'Description'),
      primaryTargetGroup: t('Primary audience', 'Cible principale'),
      secondaryTargetGroup: t('Secondary audience', 'Cible secondaire'),
      objective: t('Objective', 'Objectif'),
      minimumOpportunities: t('Frequency goal', 'Objectif de répétition'),
      budget: t('Budget', 'Budget'),
      flight: t('Dates', 'Dates'),
      countryCode: t('Market', 'Marché'),
      daypartIds: t('Periods', 'Périodes'),
    })[key] ?? key;
  function audience(role: 'primary' | 'secondary', group: PlanningTargetGroup) {
    const title = role === 'primary' ? t('Primary', 'Principale') : t('Secondary', 'Secondaire');
    const target = group.criteria;
    const parent = target.household?.parentsOfSchoolChildren;
    const set = (change: Partial<typeof target>) =>
      updateGroup(role, { ...group, criteria: { ...target, ...change } }, true);
    const selectedAges = target.ageBands ?? [];
    return (
      <fieldset className="journey-audience-card" aria-label={`${title} ${t('audience', 'cible')}`}>
        <legend>
          <span className={role === 'primary' ? 'journey-role-tag is-primary' : 'journey-role-tag'}>
            {title}
          </span>
        </legend>
        {role === 'secondary' && (
          <button
            type="button"
            className="journey-icon journey-audience-remove"
            aria-label={t('Remove secondary audience', 'Supprimer la cible secondaire')}
            onClick={() => update({ secondaryTargetGroup: undefined })}
          >
            <X size={16} />
          </button>
        )}
        <label className="journey-field">
          <span>{t('Audience', 'Cible')}</span>
          <input
            value={group.description}
            maxLength={1000}
            placeholder={t('Describe this audience', 'Décrivez cette cible')}
            onChange={(e) => updateGroup(role, { ...group, description: e.target.value })}
          />
        </label>
        {role === 'primary' && draft.audiencePlan?.targetAudience && (
          <details className="journey-disclosure">
            <summary>{t('Saved audience requirement', 'Critère de cible enregistré')}</summary>
            <p>{draft.audiencePlan.targetAudience}</p>
          </details>
        )}
        <div className="journey-audience-demographics">
          <details className="journey-age-picker">
            <summary>
              <small>{t('Age', 'Âge')}</small>
              {selectedAges.length ? ageLabel(selectedAges) : t('All ages', 'Tous âges')}
            </summary>
            <div className="journey-tags">
              <button
                type="button"
                aria-pressed={!selectedAges.length}
                onClick={() => set({ ageBands: [] })}
              >
                {!selectedAges.length && <Check size={13} />}
                {t('All ages', 'Tous âges')}
              </button>
              {AGE_BANDS.map((band) => (
                <button
                  type="button"
                  key={band}
                  aria-pressed={selectedAges.includes(band)}
                  onClick={() =>
                    set({
                      ageBands: selectedAges.includes(band)
                        ? selectedAges.filter((v) => v !== band)
                        : AGE_BANDS.filter((v) => v === band || selectedAges.includes(v)),
                    })
                  }
                >
                  {selectedAges.includes(band) && <Check size={13} />}
                  {band.replace('_plus', '+').replace('_', '–')}
                </button>
              ))}
            </div>
          </details>
          <label className="journey-field">
            <span>{t('Gender', 'Genre')}</span>
            <select
              value={target.sex ?? ''}
              onChange={(e) =>
                set({
                  sex:
                    e.target.value === 'female' || e.target.value === 'male'
                      ? e.target.value
                      : undefined,
                })
              }
            >
              <option value="">{t('Any', 'Tous')}</option>
              <option value="female">{t('Female', 'Femmes')}</option>
              <option value="male">{t('Male', 'Hommes')}</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend className="journey-field-label">SEC</legend>
          <div className="journey-tags journey-sec-tags">
            {SEC.map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={target.sec?.groups.includes(value) ?? false}
                onClick={() =>
                  set({
                    sec: {
                      groups: SEC.filter((v) =>
                        v === value
                          ? !target.sec?.groups.includes(v)
                          : target.sec?.groups.includes(v),
                      ),
                    },
                  })
                }
              >
                {target.sec?.groups.includes(value) && <Check size={13} />}
                {value}
              </button>
            ))}
          </div>
        </fieldset>
        <details
          className="journey-disclosure"
          open={Boolean(
            parent || target.unsupportedCriteria?.length || target.household?.economicDescription,
          )}
        >
          <summary>{t('More criteria', 'Autres critères')}</summary>
          <label className="journey-check">
            <input
              type="checkbox"
              checked={Boolean(parent)}
              onChange={(e) =>
                set({
                  household: {
                    ...target.household,
                    parentsOfSchoolChildren: e.target.checked ? {} : undefined,
                  },
                })
              }
            />
            {t('Parents with schoolchildren', 'Parents d’enfants scolarisés')}
          </label>
          {parent && (
            <div className="journey-parent-fields">
              <div className="journey-audience-demographics">
                {(['childAgeMin', 'childAgeMax'] as const).map((key, i) => (
                  <label className="journey-field" key={key}>
                    <span>{i === 0 ? t('Child age from', 'Âge minimum') : t('To', 'Maximum')}</span>
                    <input
                      type="number"
                      min={0}
                      max={24}
                      value={parent[key] ?? ''}
                      aria-label={`${title} ${i === 0 ? t('child age from', 'âge minimum enfant') : t('child age to', 'âge maximum enfant')}`}
                      onChange={(e) =>
                        set({
                          household: {
                            ...target.household,
                            parentsOfSchoolChildren: {
                              ...parent,
                              [key]: e.target.value === '' ? undefined : Number(e.target.value),
                            },
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              {(parent.childAgeMin === undefined ||
                parent.childAgeMax === undefined ||
                parent.childAgeMin < 0 ||
                parent.childAgeMax > 24 ||
                parent.childAgeMin > parent.childAgeMax) && (
                <p className="text-error text-xs">
                  {t('Choose a child age range from 0 to 24.', 'Choisissez un âge de 0 à 24 ans.')}
                </p>
              )}
              <label className="journey-check">
                <input
                  type="checkbox"
                  checked={Boolean(parent.schoolLocation)}
                  onChange={(e) =>
                    set({
                      household: {
                        ...target.household,
                        parentsOfSchoolChildren: {
                          ...parent,
                          schoolLocation: e.target.checked ? { scope: 'study_area' } : undefined,
                        },
                      },
                    })
                  }
                />
                {t('Schools in target area', 'Écoles dans la zone ciblée')}
              </label>
            </div>
          )}
          <details
            className="journey-disclosure"
            open={Boolean(
              target.unsupportedCriteria?.length || target.household?.economicDescription,
            )}
          >
            <summary>{t('Additional requirements', 'Critères supplémentaires')}</summary>
            <fieldset>
              <legend className="journey-field-label">
                {t('Travel purposes', 'Motifs de déplacement')}
              </legend>
              <div className="journey-tags">
                {Object.entries({
                  business: ['Work', 'Travail'],
                  education: ['Education', 'Études'],
                  shopping: ['Shopping', 'Achats'],
                  food_and_drink: ['Food', 'Restauration'],
                  healthcare: ['Healthcare', 'Santé'],
                  transport: ['Transport', 'Transport'],
                  leisure: ['Leisure', 'Loisirs'],
                  tourism: ['Tourism', 'Tourisme'],
                  religious: ['Worship', 'Culte'],
                }).map(([value, labels]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={target.travelPurposes?.includes(value) ?? false}
                    onClick={() =>
                      set({
                        travelPurposes: target.travelPurposes?.includes(value)
                          ? target.travelPurposes.filter((v) => v !== value)
                          : [...(target.travelPurposes ?? []), value],
                      })
                    }
                  >
                    {target.travelPurposes?.includes(value) && (
                      <Check size={13} aria-hidden="true" />
                    )}
                    {labels[locale === 'fr' ? 1 : 0]}
                  </button>
                ))}
              </div>
            </fieldset>
            {target.locations?.length ? (
              <div className="journey-tags">
                <span>
                  {t('Resident zones', 'Zones de résidence')} {target.locations.join(', ')}
                </span>
                <button type="button" onClick={() => set({ locations: [] })}>
                  {t('Use whole target area', 'Utiliser toute la zone')}
                </button>
              </div>
            ) : null}
            <label className="journey-field">
              <span>{t('Other requirements', 'Autres critères')}</span>
              <textarea
                rows={2}
                maxLength={240}
                value={(target.unsupportedCriteria ?? []).join('\n')}
                onChange={(e) =>
                  set({ unsupportedCriteria: e.target.value.trim() ? [e.target.value] : [] })
                }
              />
            </label>
            <label className="journey-field">
              <span>{t('Purchasing profile', 'Profil d’achat')}</span>
              <input
                maxLength={500}
                value={target.household?.economicDescription ?? ''}
                onChange={(e) =>
                  set({ household: { ...target.household, economicDescription: e.target.value } })
                }
              />
            </label>
            <label className="journey-field">
              <span>{t('Planning reason', 'Raison du choix')}</span>
              <textarea
                rows={2}
                value={group.rationale}
                maxLength={2000}
                onChange={(e) => updateGroup(role, { ...group, rationale: e.target.value })}
              />
            </label>
          </details>
        </details>
      </fieldset>
    );
  }
  return (
    <section
      className="journey-campaign-form"
      aria-label={t('Campaign setup', 'Configuration de campagne')}
    >
      <label className="journey-field journey-full">
        <span>{t('Campaign description', 'Description de campagne')}</span>
        <textarea
          rows={2}
          maxLength={8002}
          value={description}
          onChange={(e) => update({ brief: { summary: e.target.value } })}
        />
      </label>
      <div className="journey-full journey-import-row">
        <label className={`journey-button ${busy ? 'is-disabled' : ''}`}>
          <Upload size={15} />
          {busy ? t('Filling form…', 'Remplissage…') : t('Upload brief', 'Importer un brief')}
          <input
            className="sr-only"
            type="file"
            accept=".pdf,.pptx,.xlsx,.docx,.txt,.csv,.tsv,.md"
            disabled={busy || !findMarket(draft.country)}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
          />
        </label>
        {filled && (
          <>
            <span className="journey-role-tag">{t('Text-only import', 'Texte importé')}</span>
            <button
              className="journey-text-button"
              type="button"
              disabled={signature !== filled.signature}
              onClick={() => {
                onChange(filled.previous);
                if (!/^[1-9]\d*$/.test(filled.previousMinimum))
                  onMinimumOpportunities(filled.previousMinimum);
                setFilled(null);
              }}
            >
              {t('Undo', 'Annuler')}
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="journey-full text-error" role="alert">
          {error}
        </p>
      )}
      {review && (
        <div className="journey-full journey-import-review">
          <strong>{t('Review imported fields', 'Examiner les champs importés')}</strong>
          {review.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
          {review.signature !== signature && (
            <span className="journey-role-tag">
              {t(
                'Form changed · upload again to refresh',
                'Formulaire modifié · réimportez pour actualiser',
              )}
            </span>
          )}
          <dl className="journey-import-values">
            {Object.entries(review.fields).map(([key, value]) => {
              const item = value as PlanningCampaignTargetPatch & {
                amount?: number;
                currency?: string;
                startDate?: string;
                endDate?: string;
              };
              const shown =
                typeof value === 'string' || typeof value === 'number'
                  ? String(value)
                  : key === 'budget'
                    ? [item.amount, item.currency].filter((v) => v !== undefined).join(' ')
                    : key === 'flight'
                      ? [item.startDate, item.endDate ? planningLastDay(item.endDate) : undefined]
                          .filter(Boolean)
                          .join(' → ')
                      : key === 'daypartIds'
                        ? (value as string[])
                            .map((id) => STUDY_DAYPARTS.find((p) => p.id === id)?.label ?? id)
                            .join(', ')
                        : value === null
                          ? t('Remove', 'Supprimer')
                          : [
                              item.description,
                              item.ageBands?.length ? ageLabel(item.ageBands) : '',
                              item.sec?.groups.length ? `SEC ${item.sec.groups.join(' / ')}` : '',
                              item.sex,
                              item.parentsOfSchoolChildren
                                ? t('Parents with schoolchildren', 'Parents d’enfants scolarisés')
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' · ');
              return (
                <div key={key}>
                  <dt>{fieldLabel(key)}</dt>
                  <dd>
                    {shown.length > 200 ? (
                      <textarea aria-label={fieldLabel(key)} readOnly rows={3} value={shown} />
                    ) : (
                      shown
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <button
            type="button"
            className="journey-button"
            disabled={review.signature !== signature}
            onClick={() => applyFields(review)}
          >
            {t('Apply extracted fields', 'Appliquer les champs extraits')}
          </button>
        </div>
      )}
      {filled?.notes.length ? (
        <details className="journey-full journey-disclosure">
          <summary>{t('Review extracted fields', 'Examiner les champs extraits')}</summary>
          {filled.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </details>
      ) : null}
      <label className="journey-field">
        <span>{t('Objective', 'Objectif')}</span>
        <select
          value={draft.audiencePlan?.objective ?? 'reach'}
          onChange={(e) =>
            update({
              strategy: {
                ...planning.strategy,
                objective: e.target.value === 'frequency' ? 'frequency' : 'reach',
              },
            })
          }
        >
          <option value="reach">{t('Reach', 'Couverture')}</option>
          <option value="frequency">{t('Frequency', 'Répétition')}</option>
        </select>
      </label>
      <label className="journey-field">
        <span>{t('Frequency goal', 'Objectif de répétition')}</span>
        <input
          inputMode="numeric"
          value={minimumOpportunities}
          aria-invalid={!/^[1-9]\d*$/.test(minimumOpportunities)}
          onChange={(e) => onMinimumOpportunities(e.target.value)}
        />
      </label>
      <label className="journey-field">
        <span>{t('Media budget', 'Budget média')}</span>
        <input
          inputMode="decimal"
          maxLength={40}
          value={draft.budget}
          onChange={(e) => onChange((v) => ({ ...v, budget: e.target.value }))}
        />
      </label>
      <label className="journey-field">
        <span>{t('Currency', 'Devise')}</span>
        <select
          value={draft.currency}
          onChange={(e) => onChange((v) => ({ ...v, currency: e.target.value }))}
        >
          {PLANNING_CURRENCIES.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      {(['startDate', 'endDate'] as const).map((key, i) => (
        <label className="journey-field" key={key}>
          <span>{i === 0 ? t('First day', 'Premier jour') : t('Last day', 'Dernier jour')}</span>
          <input
            type="date"
            value={
              key === 'endDate' ? planningLastDay(draft.window.endDate) : draft.window.startDate
            }
            onChange={(e) =>
              onChange((v) => ({
                ...v,
                window: {
                  ...v.window,
                  [key]: key === 'endDate' ? planningExclusiveEnd(e.target.value) : e.target.value,
                },
              }))
            }
          />
        </label>
      ))}
      <label className="journey-field">
        <span>{t('Market', 'Marché')}</span>
        <select value={draft.country} onChange={(e) => onMarket(e.target.value)}>
          <option value="">{t('Choose market', 'Choisir un marché')}</option>
          {SUPPORTED_MARKETS.map((m) => (
            <option key={m.code} value={m.code}>
              {m.labels[locale]}
            </option>
          ))}
        </select>
      </label>
      <label className="journey-field">
        <span>{t('Target radius', 'Rayon ciblé')}</span>
        <select
          value={draft.modelControls?.radiusKm ?? 2}
          onChange={(e) => {
            const radiusKm = Number(e.target.value);
            const center =
              draft.modelControls?.center ??
              (findMarket(draft.country)
                ? {
                    longitude: findMarket(draft.country)!.center[0],
                    latitude: findMarket(draft.country)!.center[1],
                  }
                : undefined);
            onChange((v) =>
              withPlanning(
                {
                  ...v,
                  modelControls: { ...DEFAULT_MODEL_CONTROLS, ...v.modelControls, radiusKm },
                },
                {
                  ...context(v),
                  strategy: {
                    ...context(v).strategy,
                    geography: center ? { center, radiusKm } : undefined,
                  },
                },
              ),
            );
          }}
        >
          {[0.5, 1, 2, 3, 4, 5, 10].map((n) => (
            <option key={n} value={n}>
              {n} km
            </option>
          ))}
        </select>
      </label>
      <div className="journey-full journey-audience-grid" data-campaign-audiences>
        {audience('primary', planning.targetGroup)}
        {planning.secondaryTargetGroup ? (
          audience('secondary', planning.secondaryTargetGroup)
        ) : (
          <button
            type="button"
            className="journey-add-audience"
            onClick={() => update({ secondaryTargetGroup: emptyTarget() })}
          >
            {t('+ Secondary audience', '+ Cible secondaire')}
          </button>
        )}
      </div>
      <details className="journey-full journey-disclosure">
        <summary>{t('Campaign periods & strategy', 'Périodes et stratégie')}</summary>
        <div className="journey-tags">
          {STUDY_DAYPARTS.map((period) => {
            const chosen = planning.strategy.dayparts ?? STUDY_DAYPARTS;
            const selected = chosen.some((p) => p.id === period.id);
            return (
              <button
                type="button"
                key={period.id}
                aria-pressed={selected}
                disabled={selected && chosen.length === 1}
                onClick={() =>
                  update({
                    strategy: {
                      ...planning.strategy,
                      dayparts: selected
                        ? chosen.filter((p) => p.id !== period.id)
                        : [...chosen, period],
                    },
                  })
                }
              >
                {selected && <Check size={13} />}
                {locale === 'fr'
                  ? `${period.dayType === 'weekday' ? 'Semaine' : 'Week-end'} · ${period.localHour === 8 ? 'Matin' : period.localHour === 14 ? 'Après-midi' : period.localHour === 18 ? 'Soir' : 'Nuit'}`
                  : period.label}
              </button>
            );
          })}
        </div>
        <label className="journey-field">
          <span>{t('Strategy', 'Stratégie')}</span>
          <textarea
            rows={2}
            maxLength={2000}
            value={planning.strategy.summary}
            onChange={(e) =>
              update({ strategy: { ...planning.strategy, summary: e.target.value } })
            }
          />
        </label>
        <label className="journey-field">
          <span>{t('Reason', 'Raison')}</span>
          <textarea
            rows={2}
            maxLength={2000}
            value={planning.strategy.rationale}
            onChange={(e) =>
              update({ strategy: { ...planning.strategy, rationale: e.target.value } })
            }
          />
        </label>
      </details>
    </section>
  );
}

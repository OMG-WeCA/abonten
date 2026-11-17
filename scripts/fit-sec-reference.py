"""Offline public-survey preparation; no Python service/runtime dependency.
Run in a bounded Python 3.12 container with numpy==2.5.4 and pyreadstat==1.3.7.
Input is the official Afrobarometer R10 SAV. Output contains aggregates only.
No identifiers, coordinates, verbatim fields or raw records are read or emitted.
"""
import argparse
import hashlib
import json
import shutil
import tempfile
import zipfile
from pathlib import Path
import numpy as np
import pyreadstat

VERSION = 'abonten-multifactor-sec-r10-2026-11-08-v1'
GROUPS = ['A', 'B', 'C1', 'C2', 'D', 'E']
COUNTRIES = {'NG': 39, 'GH': 23, 'BJ': 3, 'CI': 14, 'CM': 8}
FEATURES = ['Q94B', 'Q96'] + ['Q90' + x for x in 'ABCDEFG'] + ['Q7' + x for x in 'ABCDE']
CATEGORIES = [13, 10, 8, 4]
STARTS, ITERATIONS, PRIOR = 8, 1000, 0.5
NEAR_BEST_MAP_GAP = 2.0


def fit(x, weights, seed):
    """Normalized four-domain categorical mixture with a consistent MAP objective."""
    rng = np.random.default_rng(seed)
    theta = [rng.dirichlet(np.ones(c), 6) for c in CATEGORIES]
    pi = np.ones(6) / 6
    previous = -np.inf
    converged = False
    for iteration in range(ITERATIONS):
        logs = np.log(pi)[None, :] + sum(np.log(theta[j][:, x[:, j]].T) for j in range(4))
        maximum = logs.max(axis=1)
        exp = np.exp(logs - maximum[:, None])
        response = exp / exp.sum(axis=1)[:, None]
        likelihood = float(np.dot(weights, maximum + np.log(exp.sum(axis=1))))
        objective = likelihood + PRIOR * (float(np.log(pi).sum()) + sum(float(np.log(t).sum()) for t in theta))
        wr = weights[:, None] * response
        mass = wr.sum(axis=0)
        if iteration > 5 and abs(objective - previous) < 1e-8 * max(1, abs(previous)):
            converged = True
            break
        previous = objective
        if iteration == ITERATIONS - 1:
            break
        pi = (mass + PRIOR) / (mass.sum() + 6 * PRIOR)
        for j, categories in enumerate(CATEGORIES):
            counts = np.stack([wr[x[:, j] == category].sum(axis=0) for category in range(categories)], axis=1)
            theta[j] = (counts + PRIOR) / (mass[:, None] + categories * PRIOR)
    # Occupation affects posterior membership nominally. Labels are ordered by
    # education, ownership count and inverse official lived-poverty category.
    education = theta[1] @ np.linspace(0, 1, 10)
    assets = theta[2] @ np.linspace(0, 1, 8)
    living = theta[3] @ np.linspace(1, 0, 4)
    score = (education + assets + living) / 3
    order = np.argsort(-score, kind='stable')
    return {'likelihood': likelihood, 'mapObjective': objective,
            'converged': converged, 'iterations': iteration + 1,
            'posterior': response[:, order], 'shares': (mass / mass.sum())[order],
            'mixtureProportions': pi[order],
            'scores': score[order], 'education': education[order],
            'assets': assets[order], 'living': living[order],
            'occupation': theta[0][order]}


def generate(path):
    columns = ['COUNTRY', 'Q1', 'Q101', 'withinwt_hh', 'DATEINTR'] + FEATURES
    data, _ = pyreadstat.read_sav(str(path), usecols=columns, output_format='dict')
    arrays = {key: np.asarray(value) for key, value in data.items() if key != 'DATEINTR'}
    result = {
        'version': VERSION, 'groups': GROUPS,
        'source': {
            'sourceKey': 'afrobarometer-round10-multifactor-sec',
            'version': 'AB_R10.Merge-Dataset_25Feb26.38ctry.release',
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'url': 'https://www.afrobarometer.org/wp-content/uploads/2026/10/AB_R10.Merge-Dataset_25Feb26.38ctry.release.sav.zip',
            'codebookUrl': 'https://www.afrobarometer.org/wp-content/uploads/2026/10/Merge_Round_10_Codebook_09.09.26.pdf',
            'policyUrl': 'https://www.afrobarometer.org/data/data-usage-and-access-policy/',
            'attribution': 'Afrobarometer Data, Benin, Cameroon, Côte d’Ivoire, Ghana and Nigeria, Round 10, 2024, available at https://www.afrobarometer.org.',
            'accessedAt': '2026-11-08', 'weight': 'withinwt_hh', 'adultMinAge': 18,
        },
        'method': {
            'name': 'Six normalized regularized four-domain categorical latent profiles, fitted independently within each country',
            'features': FEATURES, 'domains': ['Q94B occupation13 nominal', 'Q96 education10 categories', 'Q90A:G household ownership count0–7 (codes1or2)', 'Q7A:E official LPI category0–3'], 'categories': CATEGORIES,
            'starts': STARTS, 'maxIterations': ITERATIONS, 'dirichletAlpha': 1 + PRIOR, 'convergenceRelativeMapTolerance': 1e-8, 'nearBestMapGap': NEAR_BEST_MAP_GAP,
            'seeds': list(range(4100, 4100 + STARTS)),
            'classification': 'Fractional posterior membership; learned class shares; no equal quantiles or observed NRS/CIE grades',
            'ordering': 'Descending equal mean of fitted education, household ownership and absence-of-deprivation profiles. Occupation enters nominally.',
            'missing': 'All four domains must be complete; otherwise unknown. Strata with fewer than five complete records remain unknown.',
            'range': 'Selected union evaluated jointly across converged near-best posterior vectors. Optimization spread, approximate weighted sampling margin and unknown adult potential are separate components; not survey-design confidence intervals',
            'ageBoundary': 'WorldPop 15_19 contributes 2/5 adult mass (ages18–19), a declared uniform within-bin age assumption; other under18 mass stays unknown',
        }, 'countries': {},
    }
    for country, code in COUNTRIES.items():
        mask = (arrays['COUNTRY'] == code) & (arrays['Q1'] >= 18) & (arrays['Q1'] <= 120) & np.isin(arrays['Q101'], [1, 2]) & (arrays['withinwt_hh'] > 0)
        all_indices = np.flatnonzero(mask)
        raw = np.column_stack([arrays[key][mask] for key in FEATURES])
        valid = np.ones(len(raw), dtype=bool)
        for j, key in enumerate(FEATURES):
            upper = 2 if key.startswith('Q90') else 12 if key == 'Q94B' else 9 if key == 'Q96' else 4
            valid &= np.isfinite(raw[:, j]) & (raw[:, j] >= 0) & (raw[:, j] <= upper)
        admitted = raw[valid].astype(int)
        lpi_sum = admitted[:, 9:].sum(axis=1)
        lpi_category = np.where(lpi_sum == 0, 0, np.where(lpi_sum <= 5, 1, np.where(lpi_sum <= 10, 2, 3)))
        x = np.column_stack([admitted[:, 0], admitted[:, 1], (admitted[:, 2:9] > 0).sum(axis=1), lpi_category])
        total_weight = arrays['withinwt_hh'][mask]
        weights = total_weight[valid]
        weights = weights * len(weights) / weights.sum()
        fits = [fit(x, weights, seed) for seed in range(4100, 4100 + STARTS)]
        converged = [f for f in fits if f['converged']]
        if not converged:
            raise RuntimeError(f'{country}: no converged SEC fit; no reference emitted')
        best = max(converged, key=lambda item: item['mapObjective'])
        near_best = [f for f in converged if best['mapObjective'] - f['mapObjective'] <= NEAR_BEST_MAP_GAP]
        records = []
        for age_start in range(15, 85, 5):
            age_band = '80_plus' if age_start == 80 else f'{age_start}_{age_start + 4}'
            age_mask = (arrays['Q1'][mask] >= max(18, age_start)) & ((arrays['Q1'][mask] <= age_start + 4) if age_start < 80 else True)
            for sex, sex_code in [('male', 1), ('female', 2)]:
                subset = age_mask & (arrays['Q101'][mask] == sex_code)
                selected = subset[valid]
                denom = total_weight[subset].sum()
                known_weight = total_weight[valid][selected]
                classified = float(known_weight.sum() / denom) if denom > 0 and selected.sum() >= 5 else 0
                probabilities = np.zeros(6)
                alternatives = np.zeros((len(near_best), 6))
                all_weight = total_weight[subset]
                effective_n = float(all_weight.sum() ** 2 / np.dot(all_weight, all_weight)) if len(all_weight) else 0
                if classified:
                    posterior = best['posterior'][selected]
                    probabilities = (known_weight[:, None] * posterior).sum(axis=0) / denom
                    alternatives = np.stack([(known_weight[:, None] * f['posterior'][selected]).sum(axis=0) / denom for f in near_best])
                records.append({'ageBand': age_band, 'sex': sex, 'sampleSize': int(subset.sum()),
                                'completeSampleSize': int(selected.sum()), 'weightedSampleMass': float(denom), 'effectiveSampleSize': effective_n,
                                'classifiedShare': classified, 'unknownShare': 1 - classified,
                                'probabilities': probabilities.tolist(), 'nearBestProbabilities': alternatives.tolist()})
        dates = [str(data['DATEINTR'][i])[:10] for i in all_indices]
        result['countries'][country] = {
            'sampleSize': len(all_indices), 'completeSampleSize': int(valid.sum()),
            'classifiedWeightedShare': float(total_weight[valid].sum() / total_weight.sum()),
            'surveyPeriod': {'from': min(dates), 'to': max(dates)},
            'fit': {key: (value.tolist() if isinstance(value, np.ndarray) else value) for key, value in best.items() if key != 'posterior'},
            'multistart': {'mapObjectives': [f['mapObjective'] for f in fits], 'likelihoods': [f['likelihood'] for f in fits], 'converged': [f['converged'] for f in fits], 'nearBestMapObjectives': [f['mapObjective'] for f in near_best],
                           'classShareRange': np.ptp(np.stack([f['shares'] for f in fits]), axis=0).tolist()},
            'strata': records,
        }
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sav', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.sav.suffix.lower() == '.zip':
        with tempfile.TemporaryDirectory() as directory, zipfile.ZipFile(args.sav) as archive:
            name = next(name for name in archive.namelist() if name.lower().endswith('.sav') and not name.startswith('__MACOSX/'))
            path = Path(directory) / 'reference.sav'
            with archive.open(name) as source, path.open('wb') as destination:
                shutil.copyfileobj(source, destination)
            result = generate(path)
            result['source']['archiveSha256'] = hashlib.sha256(args.sav.read_bytes()).hexdigest()
    else:
        result = generate(args.sav)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')

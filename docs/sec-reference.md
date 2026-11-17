# Abonten modeled SEC reference

The A, B, C1, C2, D and E labels identify six ordered Abonten model profiles. They are not observed NRS grades, household chief-earner occupations, wealth percentiles or purchasing-capacity bands.

The reference uses public Afrobarometer Round 10 respondent records from Nigeria, Ghana, Benin, Côte d’Ivoire and Cameroon. Each country is fitted independently using `withinwt_hh`. Only numeric country, age, gender, occupation, education, household ownership, lived-poverty responses, weight and interview date are read. Respondent identifiers, geographic coordinates and verbatim answers are excluded. The current actual survey samples are 1,600 / 2,400 / 1,200 / 1,200 / 1,200 respectively; all five interviews occurred in 2024. The downloaded SAV checksum and each country's survey interval are retained in the aggregate.

The normalized categorical mixture has four domains: respondent occupation (nominal), education, count of seven household ownership items, and the official four-category Lived Poverty Index. Ownership includes either another household member or the respondent (Q90 codes 1 or 2). All four domains must be complete to classify a record. Six class proportions are learned separately in each country; they are not fixed to equal sizes. A symmetric Dirichlet prior with alpha 1.5 regularizes category and mixture probabilities. Eight deterministic starts use seeds 4100–4107. Fit selection and convergence use the same penalized MAP objective. Only converged fits within two MAP units of the best converged fit form the optimizer-sensitivity ensemble; that tolerance does not define a confidence region.

Class ordering uses the equal mean of each fitted profile's education, asset count and inverse lived-poverty category. Occupation influences membership nominally; students, homemakers and people without work are not automatically assigned class E. Posterior memberships remain fractional. Age/gender aggregates include unclassified cases in their denominator. Strata with fewer than five complete records remain unclassified.

Runtime applies these national age/gender profiles to the fixed resident population. Evidence is adult-only: the 15–19 population group contributes 2/5 adult mass under a declared uniform within-bin assumption; ages under 18 remain outside SEC qualification. Selecting several classes uses their union. Selecting all six qualifies every eligible adult, including people whose individual grade is unknown; this does not assign their grade. With a parent criterion, all six preserves the existing parent estimate and bounds exactly. Unclassified adults could qualify in the upper sensitivity case. Entirely unsupported selected adult strata are unavailable, not zero people. Parent and SEC membership are not jointly observed; the combined estimate uses conditional maximum entropy for its base and structural dependence bounds.

Optimizer variation is calculated from the selected union on the actual chosen population weights. Approximate weighted sampling variation, unknown adult potential and unobserved parent dependence are separate sources of uncertainty. The displayed sensitivity range is not a survey-design confidence interval or independent validation of the model classes.

The pilot publication rule withholds selected SEC population/reach/frequency when the converged near-best union spread exceeds five percentage points of the actual selected eligible adult cohort population. This is an internal Abonten rule, not an industry standard or confidence interval. It is evaluated per audience and footprint; a withheld secondary estimate does not block primary optimization. Selecting all six has zero identification spread. Source coverage, optimizer diagnostics and other plan information remain available.

## Reproduce the reference

Run offline preparation in Docker. The serving API remains TypeScript and needs no Python dependencies. The output is an aggregate reference; keep the ZIP/SAV outside the repository and remove it after preparation.

```sh
sec_work=$(mktemp -d /tmp/abonten-sec.XXXXXX)
trap 'rm -rf "$sec_work"' EXIT
curl -fL --max-time 120 --max-filesize 80000000 \
  -o "$sec_work/round10.zip" \
  'https://www.afrobarometer.org/wp-content/uploads/2026/10/AB_R10.Merge-Dataset_25Feb26.38ctry.release.sav.zip'
docker run --rm --cpus=2 --memory=2g \
  -v "$PWD/scripts/fit-sec-reference.py:/prep.py:ro" -v "$sec_work:/work" \
  python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b \
  sh -c 'pip install --no-cache-dir numpy==2.5.4 pyreadstat==1.3.7 narwhals==2.28.0 && python /prep.py /work/round10.zip /work/sec-reference.json'
```

Review convergence, objective gaps, ordered profiles, class proportions, selected-union stability and coverage before replacing the aggregate. A refresh requires a new reference version and source checksum. This invalidates incompatible stored studies. Do not transfer survey microdata to a planning provider.

Sources: [public merged data](https://www.afrobarometer.org/data/merged-data/), [Round 10 codebook](https://www.afrobarometer.org/wp-content/uploads/2026/10/Merge_Round_10_Codebook_09.09.26.pdf), [usage policy](https://www.afrobarometer.org/data/data-usage-and-access-policy/). Citation: Afrobarometer Data, Benin, Cameroon, Côte d’Ivoire, Ghana and Nigeria, Round 10, 2024, available at https://www.afrobarometer.org.

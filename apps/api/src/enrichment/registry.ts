/** Source configuration is the only country-specific code in the import pipeline. */
export type Bounds = readonly [west: number, south: number, east: number, north: number];
export type EnrichmentLayer =
  'roads' | 'pois' | 'admin1' | 'admin2' | 'population' | 'population_demographics' | 'traffic';
export interface CountryConfiguration {
  code: string;
  iso3: string;
  name: string;
  aliases: readonly string[];
  bbox: Bounds;
  bounds: Bounds;
  geofabrikSlug: string;
  boundaryLicences: { admin1: string; admin2: string };
}
export const countries: readonly CountryConfiguration[] = [
  {
    code: 'NG',
    iso3: 'NGA',
    name: 'Nigeria',
    aliases: ['Federal Republic of Nigeria'],
    bbox: [2.2, 3.6, 15, 14],
    bounds: [2.2, 3.6, 15, 14],
    geofabrikSlug: 'nigeria',
    boundaryLicences: { admin1: 'CC-BY-4.0', admin2: 'CC-BY-4.0' },
  },
  {
    code: 'GH',
    iso3: 'GHA',
    name: 'Ghana',
    aliases: ['Republic of Ghana'],
    bbox: [-3.6, 4.2, 1.5, 11.3],
    bounds: [-3.6, 4.2, 1.5, 11.3],
    geofabrikSlug: 'ghana',
    boundaryLicences: { admin1: 'CC-BY-SA-2.0', admin2: 'CC-BY-4.0' },
  },
  {
    code: 'BJ',
    iso3: 'BEN',
    name: 'Benin',
    aliases: ['Bénin'],
    bbox: [0.5, 5.8, 4, 12.7],
    bounds: [0.5, 5.8, 4, 12.7],
    geofabrikSlug: 'benin',
    boundaryLicences: { admin1: 'Public-Domain', admin2: 'Public-Domain' },
  },
  {
    code: 'CI',
    iso3: 'CIV',
    name: "Côte d'Ivoire",
    aliases: ['Cote d Ivoire', 'Ivory Coast'],
    bbox: [-9, 4, -2, 11],
    bounds: [-9, 4, -2, 11],
    geofabrikSlug: 'ivory-coast',
    boundaryLicences: { admin1: 'CC-BY-4.0', admin2: 'CC-BY-4.0' },
  },
  {
    code: 'CM',
    iso3: 'CMR',
    name: 'Cameroon',
    aliases: ['Cameroun'],
    bbox: [7.9, 1.2, 16.5, 13.3],
    bounds: [7.9, 1.2, 16.5, 13.3],
    geofabrikSlug: 'cameroon',
    boundaryLicences: { admin1: 'CC-BY-3.0', admin2: 'CC-BY-4.0' },
  },
];
export function countryFor(value: string): CountryConfiguration | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return countries.find((country) =>
    [country.code, country.iso3, country.name, ...country.aliases].some(
      (alias) => alias.toLowerCase() === normalized,
    ),
  );
}
export interface SourceConfiguration {
  key: string;
  label: string;
  layers: readonly EnrichmentLayer[];
  url: string | null;
  licence: string | null;
  licenceUrl: string | null;
  attribution: string;
  unit: string;
  referenceYear: number | null;
  version: string | null;
  /** Prefixes are checked at every redirect; no arbitrary caller-controlled fetches. */
  allowedUrlPrefixes: readonly string[];
  warnings: readonly string[];
}

/** Apply the same official-source policy to downloads, redirects and import manifests. */
export function isRegisteredSourceUrl(value: string, source: SourceConfiguration): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.port && url.port !== '443')
  )
    return false;
  if (source.key === 'osm-geofabrik' && source.url) {
    const latest = new URL(source.url);
    const datedPath = latest.pathname.replace('-latest.osm.pbf', '-\\d{6}\\.osm\\.pbf');
    if (url.origin === latest.origin && new RegExp(`^${datedPath}$`).test(url.pathname))
      return true;
  }
  return source.allowedUrlPrefixes.some((prefix) =>
    prefix.endsWith('/') ? url.href.startsWith(prefix) : url.href === prefix,
  );
}

export function configuredSource(
  countryCode: string,
  sourceKey: string,
): SourceConfiguration | undefined {
  const country = countryFor(countryCode);
  if (!country) return undefined;
  const base = { referenceYear: null, version: null, warnings: [] as readonly string[] };
  if (sourceKey === 'osm-geofabrik') {
    const url = `https://download.geofabrik.de/africa/${country.geofabrikSlug}-latest.osm.pbf`;
    return {
      ...base,
      key: sourceKey,
      label: 'OpenStreetMap via Geofabrik',
      warnings: [
        'OpenStreetMap completeness varies; mapped features are not a traffic survey',
        'OSM geometries may be clipped to declared coverage at extract boundaries',
      ],
      layers: ['roads', 'pois'],
      url,
      licence: 'ODbL-1.0',
      licenceUrl: 'https://www.openstreetmap.org/copyright',
      attribution: '© OpenStreetMap contributors; extract by Geofabrik',
      unit: 'features',
      allowedUrlPrefixes: [url],
    };
  }
  if (sourceKey === 'geoboundaries-adm1' || sourceKey === 'geoboundaries-adm2') {
    const level = sourceKey.endsWith('adm1') ? 'admin1' : 'admin2';
    const adm = level === 'admin1' ? 'ADM1' : 'ADM2';
    const licence = country.boundaryLicences[level];
    return {
      ...base,
      key: sourceKey,
      label: `geoBoundaries gbOpen ${adm}`,
      layers: [level],
      url: `https://www.geoboundaries.org/api/current/gbOpen/${country.iso3}/${adm}/`,
      licence,
      licenceUrl:
        licence === 'CC-BY-SA-2.0'
          ? 'https://creativecommons.org/licenses/by-sa/2.0/'
          : licence === 'Public-Domain'
            ? 'https://www.geoboundaries.org/'
            : `https://creativecommons.org/licenses/by/${licence === 'CC-BY-3.0' ? '3.0' : '4.0'}/`,
      attribution:
        'geoBoundaries (William & Mary geoLab) and the upstream boundary producer; preserve metadata attribution',
      unit: 'administrative_areas',
      allowedUrlPrefixes: [
        `https://www.geoboundaries.org/api/current/gbOpen/${country.iso3}/${adm}/`,
        'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/',
        'https://github.com/wmgeolab/geoBoundaries/raw/',
        'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/',
      ],
    };
  }
  if (sourceKey === 'worldpop-r2025a-2026') {
    const url = `https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/2026/${country.iso3}/v1/100m/constrained/${country.iso3.toLowerCase()}_pop_2026_CN_100m_R2025A_v1.tif`;
    return {
      key: sourceKey,
      label: 'WorldPop Global2 R2025A constrained 100 m population',
      layers: ['population'],
      url,
      licence: 'CC-BY-4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'WorldPop, University of Southampton (Global2 R2025A)',
      unit: 'persons_per_pixel',
      warnings: [
        'WorldPop R2025A is an alpha release; review provider caveats before planning use',
        '2026 population is modelled/projected resident population, not observed footfall or advertising exposure',
      ],
      referenceYear: 2026,
      version: 'R2025A-v1-2026',
      allowedUrlPrefixes: [url],
    };
  }
  const demographic = /^worldpop-age-sex:([fm]):(\d{1,2}_\d{1,2}|80_plus)$/.exec(sourceKey);
  if (demographic) {
    const [, sex, band] = demographic;
    const firstAge = Number(band.split('_')[0]);
    if (
      !['0_4', '80_plus'].includes(band) &&
      (firstAge < 5 ||
        firstAge > 75 ||
        firstAge % 5 !== 0 ||
        band !== `${firstAge}_${firstAge + 4}`)
    )
      return undefined;
    const baseUrl = `https://data.worldpop.org/GIS/AgeSex_structures/Global_2015_2030/R2025A/2026/${country.iso3}/v1/1km_ua/constrained/`;
    // Native classes are 0, 1–4, then five-year bands named by their lower age;
    // 90 is open-ended. They are not single-year rasters.
    const starts = band === '0_4' ? [0, 1] : band === '80_plus' ? [80, 85, 90] : [firstAge];
    const urls = starts.map(
      (age) =>
        `${baseUrl}${country.iso3.toLowerCase()}_${sex}_${String(age).padStart(2, '0')}_2026_CN_1km_R2025A_UA_v1.tif`,
    );
    return {
      key: sourceKey,
      label: `WorldPop Global2 R2025A ${sex === 'f' ? 'female' : 'male'} ages ${band.replace('_', '-')}`,
      layers: ['population_demographics'],
      url: urls.length === 1 ? urls[0] : null,
      licence: 'CC-BY-4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'WorldPop, University of Southampton (Global2 R2025A)',
      unit: 'persons_per_pixel',
      referenceYear: 2026,
      version: 'R2025A-v1-2026',
      allowedUrlPrefixes: urls,
      warnings: [
        'WorldPop R2025A projected resident age/sex structure is not an observed traveler profile',
        'Demographic grids use 1 km cells; local estimates retain their spatial coverage and resolution',
        ...(urls.length > 1
          ? [`Band ${band} sums the corresponding native WorldPop age grids: ${starts.join(', ')}`]
          : []),
      ],
    };
  }
  if (sourceKey === 'observed-traffic') {
    return {
      ...base,
      key: sourceKey,
      label: 'Operator-supplied observed traffic counts',
      layers: ['traffic'],
      url: null,
      licence: null,
      licenceUrl: null,
      attribution: 'Declared survey provider',
      unit: 'observations',
      allowedUrlPrefixes: [],
    };
  }
  return undefined;
}

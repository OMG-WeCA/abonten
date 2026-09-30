# Geographic-context source imports

Implements SPEC §5.2 (V1 structured third-party import) and §8.1 (country-extensible reference data).
These datasets describe mapped context, modeled resident population, or explicitly observed traffic.
They do **not** establish advertising impressions, audience reach, AADT, demographics, or a visibility score.
Production API reads never fall back to fixtures. Development fixtures are marked `data_class=demo`.

## Prerequisites and storage

- Apply the versioned PostgreSQL/PostGIS migrations using the normal migration command.
- Node and the repository's pnpm dependencies, plus **GDAL 3.6+** (tested with 3.10.3) (`gdalinfo`, `gdal_translate`,
  `ogr2ogr`) with GTiff/BigTIFF, OSM and GeoJSONSeq drivers. The runtime image installs GDAL.
  `osmium` is not required: GDAL's OSM driver reads actual Geofabrik `.osm.pbf` directly.
- Set `DATABASE_URL` to the operator database. There is no public import or arbitrary-URL API endpoint.
- Set `ENRICHMENT_DATA_DIR` to durable storage mounted at the **same absolute path** for the import
  operator and API. Back up it together with the database. Default `./var/enrichment` is suitable
  only when that working directory is itself persistent.
- Allow enough disk for original input, retained immutable raw data, and temporary GDAL output.
  Full Nigeria OSM extracts can require several GB during preprocessing. Run imports as a dedicated
  operator with filesystem/database permissions, rather than the normal web user.

Raw vectors/PBFs are retained at `ENRICHMENT_DATA_DIR/raw/<sha256>.<format>`; population GeoTIFFs
at `ENRICHMENT_DATA_DIR/<sha256>.tif`. Files are copied with exclusive creation, hash-verified and
made read-only before database activation. The append-only audit record retains `rawPath` and
all source manifest fields. Temporary operator inputs can then be removed without losing raw evidence.
Do not remove managed files while any retained import references them. Failed imports can leave
unreferenced content-addressed files; intentional offline cleanup must cross-check retained imports/audits.

## Registry

`apps/api/src/enrichment/registry.ts` is the single country-specific adapter configuration.
Nigeria (`NG`, `NGA`, Nigeria) and Ghana (`GH`, `GHA`, Ghana) are enabled. Names and aliases are
normalized to ISO2. Adding another country requires a reviewed registry entry and source/licence
verification, not another country-specific service or schema.

The registry bounds are deliberately broad plausibility guards, not national boundary polygons.
For example, Geofabrik retains complete border-crossing ways. Every actual imported feature must
still be covered by its declared dataset coverage polygon.

| Source key             | Layers          | Unit / quality                                                              | Source                                                                                          |
| ---------------------- | --------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `osm-geofabrik`        | `roads`, `pois` | `features` / `mapped`                                                       | Country `.osm.pbf` from [Geofabrik Africa](https://download.geofabrik.de/africa.html); ODbL-1.0 |
| `geoboundaries-adm1`   | `admin1`        | `administrative_areas` / `mapped`                                           | [geoBoundaries gbOpen API](https://www.geoboundaries.org/api.html)                              |
| `geoboundaries-adm2`   | `admin2`        | `administrative_areas` / `mapped`                                           | Same API; independently versioned/licensed                                                      |
| `worldpop-r2025a-2026` | `population`    | `persons_per_pixel` / `modelled`                                            | WorldPop Global2 R2025A, constrained 100 m, 2026, v1; CC-BY-4.0                                 |
| `observed-traffic`     | `traffic`       | dataset `observations`, individual `vehicles` or `pedestrians` / `observed` | Operator-authorized local survey file; no default traffic provider or fabricated counts         |

geoBoundaries current metadata was verified on 2026-09-30: Ghana ADM1 is a 2021 boundary dataset
with **CC-BY-SA-2.0** licensing; Ghana ADM2 is 2019 CC-BY-4.0; Nigeria ADM1/ADM2 are 2022 CC-BY-4.0.
Do not apply one country's/level's licence or reference year to the others. Preserve the upstream
producer's attribution from the metadata. Reverify metadata before future refreshes; a change
requires deliberate registry review. `admUnitCount` is a string in the live API, which returns a
single metadata object, not an array.

## Download, prepare, import

```sh
pnpm --filter @abonten/api enrichment:import sources
pnpm --filter @abonten/api enrichment:import download \
  --country GH --source geoboundaries-adm1 --output /data/ghana-adm1.geojson \
  > /data/ghana-adm1.download.json
pnpm --filter @abonten/api enrichment:import download \
  --country NG --source worldpop-r2025a-2026 --output /data/nigeria-population.tif \
  > /data/nigeria-population.download.json
pnpm --filter @abonten/api enrichment:import download \
  --country GH --source osm-geofabrik --output /data/ghana.osm.pbf \
  > /data/ghana-osm.download.json
```

The download command uses only registered official HTTPS URLs, checks every redirect, refuses
credentials/query strings, bounds redirects to four, responses to 2 GiB, and total time to one hour.
It never overwrites an existing output. geoBoundaries metadata resolves `gjDownloadURL`; its full
metadata, fetched time and artifact SHA-256 are returned in the download report. Publication date
is not inferred from download time. If a country snapshot exceeds the time/size bounds, download
it using the provider's supported tool outside this CLI and supply a checked local artifact.

Create a JSON manifest for each **country/source/layer/version**. For example, the structure of an
OSM roads manifest is below. Replace the marked SHA-256 with the actual downloaded file hash and
set coverage/version/timestamps to the artifact you actually acquired; this is not seed data.

```json
{
  "countryCode": "GH",
  "sourceKey": "osm-geofabrik",
  "layer": "roads",
  "dataClass": "production",
  "version": "your-extract-timestamp-or-snapshot-id",
  "referenceYear": 2026,
  "publishedAt": null,
  "fetchedAt": "2026-09-30T09:00:00Z",
  "licence": "ODbL-1.0",
  "licenceUrl": "https://www.openstreetmap.org/copyright",
  "attribution": "© OpenStreetMap contributors; extract by Geofabrik",
  "sourceUrl": "https://download.geofabrik.de/africa/ghana-latest.osm.pbf",
  "checksum": "REPLACE_WITH_64_HEXADECIMAL_SHA256_CHARACTERS",
  "originalCrs": "EPSG:4326",
  "coverage": {
    "type": "Polygon",
    "coordinates": [
      [
        [-3.6, 4.2],
        [1.5, 4.2],
        [1.5, 11.3],
        [-3.6, 11.3],
        [-3.6, 4.2]
      ]
    ]
  },
  "unit": "features",
  "quality": "mapped",
  "warnings": [
    "OpenStreetMap feature completeness varies; this extract envelope is not a completeness guarantee"
  ]
}
```

`coverage` is a GeoJSON Polygon/MultiPolygon describing the artifact coverage. A normalized vector snapshot
must fit entirely within it; declare a sufficiently broad extract envelope or clip
features explicitly in GIS. The PBF adapter automatically clips to declared coverage before normalization,
so border-completing ways do not make a national import fail; source IDs are retained and clipping is disclosed. Avoid unnecessarily narrow polygons if retaining complete OSM ways is important.
For a raster, use its actual extent or a smaller valid footprint. The importer verifies that it
cannot claim coverage outside the actual native grid. The API clips raster cells to the declared
footprint. Holes/NoData stay unknown. Coverage does not certify completeness of OSM mapping.

Run:

```sh
pnpm --filter @abonten/api enrichment:import import \
  --input /data/ghana.osm.pbf --manifest /data/ghana-roads.manifest.json \
  --operator your-operator-id
```

Repeat with `layer=pois` and the corresponding manifest to import POIs from the same PBF. The
SHA-256 is the original artifact hash, not the normalized output. Accepted vector alternatives:
WGS84 GeoJSON FeatureCollections (maximum 256 MiB) or streamed GeoJSONSeq (`.geojsons`, `.geojsonl`,
`.ndjson`). No CRS guessing: reproject prior to import and record the supplied artifact CRS.
GDAL only opens PBF inputs with the OSM driver, and rasters with GTiff; renamed VRT files cannot
resolve nested remote sources. No network fetch occurs while importing local artifacts.

Imports validate runtime structure, finite WGS84 coordinates, country plausibility, stable external
IDs, geometry type, PostGIS validity, declared coverage, checksum, and provenance before activation.
Duplicate IDs or invalid/empty datasets roll back the complete transaction, leaving the previous
active snapshot intact. A transaction-scoped advisory lock serializes each country/source/layer/
data-class; bulk inserts and the activation audit commit together.

**Snapshot replacement, not geographic patching:** exactly one active snapshot is retained per
country/source/layer/data-class. A second clipped import replaces the first; it does not append
another city to it. Combine desired regions into one artifact/manifest before activation. Old
imports, features, raw bytes and audits remain available for provenance. Replaying the same version,
checksum and manifest is a no-op with no duplicate audit. Changed bytes or provenance/coverage
require a new version; replaying an old inactive version does not reactivate it.

WorldPop `version` starts with the registered product identity `R2025A-v1-2026`. Use that exact
value for the original snapshot, or `R2025A-v1-2026@<operator-revision>` for an intentional corrected
clip/coverage/manifest. The product family and reference year stay fixed. WorldPop alpha-release and modelled/projection
caveats are mandatory registry warnings even if the operator omits them. See the
[WorldPop R2025A v1 release statement](https://data.worldpop.org/repo/prj/Global_2015_2030/R2025A/doc/Global2_Release_Statement_R2025A_v1.pdf). A different product/year
needs a new registered source; changing operator revision does not relabel the population vintage.

## Adapter semantics

### OSM

The PBF adapter preprocesses roads (`lines`) and POIs (`points`, `multipolygons`) with GDAL into
streamed GeoJSONSeq. Source tag predicates are applied before clipping, so unrelated buildings/land-cover
objects do not enter the POI geometry contract. Relevant unsupported or invalid geometry fails the whole
import with its source ID; it is not silently skipped. One preprocessing process has a 30-minute bound. External IDs retain OSM
node/way/relation IDs rather than transient exported row numbers. Roads expose name, class, ref,
oneway, lanes and maxspeed as mapped tags; missing values are null. They never infer observed counts.
POIs retain name, a useful coarse category (education, healthcare, shopping, religious, transport,
business etc.), source subtype and a restricted set of original category tags. Polygon POIs remain
polygons; they are not misleading centroids. The map data's gaps remain visible in provenance.

### geoBoundaries

The GeoJSON adapter requires `shapeName`, `shapeID`, `shapeGroup`, `shapeType` and checks the ISO3
country/ADM level. It retains optional `shapeISO`. ADM2 does not have a universally supplied ADM1
parent ID; spatial context resolves containment without inventing an administrative relation.

### WorldPop

Input must be a single-band north-up, unrotated WGS84 GeoTIFF/BigTIFF with explicit finite NoData,
no unexplained scale/offset and no external alpha/mask. Original `.msk`, `.aux.xml` and `.aux`
sidecars (case-insensitive, including a symlink target) are rejected before copying; consolidate validity
and metadata into a standalone GeoTIFF first. GDAL sidecar discovery stays disabled. Values are persons per native pixel.
`gdalinfo` verifies the grid; `gdal_translate -srcwin -of XYZ` extracts bounded windows at the original
resolution. No resampling or fabricated conversion from density is performed. API queries are
limited to native cell count, two concurrent GDAL slots and eight waiting queries, with 30-second
process bounds. Exact cell polygons let PostGIS multiply each count by its fractional geodesic
intersection with the buffer and manifest footprint. NoData is null and excluded, never zero.
Any reported nominal pixel size is approximate; actual population weighting uses cell geometry.
A modeled resident population estimate is neither passers-by nor advertising exposure.

### Observed traffic

Use a local GeoJSON FeatureCollection or GeoJSONSeq with stable IDs and Point/LineString/
MultiLineString geometry. Feature properties must include:

```json
{
  "startedAt": "2026-09-29T08:00:00Z",
  "endedAt": "2026-09-29T09:00:00Z",
  "durationMinutes": 60,
  "count": null,
  "unit": "vehicles",
  "direction": "eastbound",
  "vehicleClasses": ["cars", "buses"],
  "method": "manual tally; survey reference XYZ"
}
```

These are schema examples, not actual measurements. Supply the actual collected timestamps,
duration, direction, included classes and method. Missing count remains null. Actual counts must
be nonnegative integers; observed intervals must match the stated duration. Missing direction or
class definitions are rejected; do not invent them. A source can explicitly report `unknown` as
a direction only when that is what its record says. Pedestrian records use `unit=pedestrians` and
an explicit empty `vehicleClasses` array. The manifest unit is `observations`, quality `observed`,
and must state the actual authorized provider, source URL, licence and attribution. Nothing in this
adapter annualizes short counts, treats a mapped road as a survey, or invents an OTS model.

## Verification

`pnpm --filter @abonten/api test` includes importer validation tests. Raster/OSM driver tests
exercise GDAL when installed and explicitly skip if the prerequisite is absent. PostgreSQL tests
are run separately with the repository's integration-test environment. A unit-test pass alone is
not evidence of a successful national production import: inspect the returned ID/count, active
manifest, audit and context response for both a point inside coverage and one outside it.

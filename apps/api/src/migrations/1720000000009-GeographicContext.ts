import type { MigrationInterface, QueryRunner } from 'typeorm';

/** SPEC §5.2: immutable public reference imports. Private site geometry stays in inventory. */
export class GeographicContext1720000000009 implements MigrationInterface {
  name = 'GeographicContext1720000000009';

  async up(runner: QueryRunner): Promise<void> {
    // Unlike marketplace's non-spatial fallback, enrichment requires real metre/area
    // calculations. Fail clearly instead of silently claiming degree-based precision.
    await runner.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await runner.query(`CREATE TABLE enrichment_imports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      country_code varchar(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
      source_key text NOT NULL, layer text NOT NULL CHECK (layer IN ('roads','pois','admin1','admin2','population','traffic')),
      data_class text NOT NULL CHECK (data_class IN ('demo','production')),
      version text NOT NULL, reference_year integer NOT NULL CHECK (reference_year BETWEEN 1900 AND 2200),
      published_at timestamptz, fetched_at timestamptz NOT NULL,
      licence text NOT NULL, licence_url text NOT NULL, attribution text NOT NULL,
      source_url text NOT NULL, checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
      original_crs text NOT NULL, coverage geometry(MultiPolygon,4326) NOT NULL,
      unit text NOT NULL, quality text NOT NULL CHECK (quality IN ('mapped','modelled','observed')),
      warnings jsonb NOT NULL DEFAULT '[]'::jsonb, raster_path text,
      feature_count integer NOT NULL DEFAULT 0 CHECK (feature_count >= 0),
      active boolean NOT NULL DEFAULT false, operator text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(country_code,source_key,layer,version,data_class),
      CHECK (ST_IsValid(coverage) AND NOT ST_IsEmpty(coverage)),
      CHECK ((layer = 'population') = (raster_path IS NOT NULL)),
      CHECK (layer <> 'population' OR unit = 'persons_per_pixel')
    )`);
    await runner.query(`CREATE UNIQUE INDEX enrichment_one_active_source ON enrichment_imports
      (country_code, source_key, layer, data_class) WHERE active`);
    await runner.query(
      `CREATE INDEX enrichment_current_layers ON enrichment_imports(country_code,layer,data_class) WHERE active`,
    );
    await runner.query(`CREATE TABLE enrichment_features (
      import_id uuid NOT NULL REFERENCES enrichment_imports(id) ON DELETE CASCADE,
      external_id text NOT NULL, geom geometry(Geometry,4326) NOT NULL,
      properties jsonb NOT NULL, PRIMARY KEY(import_id,external_id),
      CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom))
    )`);
    await runner.query(
      `CREATE INDEX enrichment_features_geom ON enrichment_features USING gist(geom)`,
    );
    await runner.query(
      `CREATE INDEX enrichment_features_geography ON enrichment_features USING gist((geom::geography))`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE enrichment_features');
    await runner.query('DROP TABLE enrichment_imports');
    // Shared PostGIS extension and historical audit log intentionally survive rollback.
  }
}

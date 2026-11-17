import type { MigrationInterface, QueryRunner } from 'typeorm';

/** SPEC 5.2/5.3. Age/sex estimates use the same immutable raster import path. */
export class PopulationDemographics1760000011000 implements MigrationInterface {
  name = 'PopulationDemographics1760000011000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE enrichment_imports
      DROP CONSTRAINT enrichment_imports_layer_check,
      DROP CONSTRAINT enrichment_imports_check,
      DROP CONSTRAINT enrichment_imports_check1,
      ADD CONSTRAINT enrichment_imports_layer_check CHECK
        (layer IN ('roads','pois','admin1','admin2','population','population_demographics','traffic')),
      ADD CONSTRAINT enrichment_imports_check CHECK
        ((layer IN ('population','population_demographics')) = (raster_path IS NOT NULL)),
      ADD CONSTRAINT enrichment_imports_check1 CHECK
        (layer NOT IN ('population','population_demographics') OR unit = 'persons_per_pixel')`);
  }

  async down(runner: QueryRunner): Promise<void> {
    // Imported evidence must be explicitly retained/exported before removing its storage contract.
    const rows: { count: string }[] = await runner.query(
      "SELECT count(*)::text AS count FROM enrichment_imports WHERE layer = 'population_demographics'",
    );
    if (Number(rows[0].count))
      throw new Error('Retain and remove demographic imports before reverting this migration.');
    await runner.query(`ALTER TABLE enrichment_imports
      DROP CONSTRAINT enrichment_imports_layer_check,
      DROP CONSTRAINT enrichment_imports_check,
      DROP CONSTRAINT enrichment_imports_check1,
      ADD CONSTRAINT enrichment_imports_layer_check CHECK
        (layer IN ('roads','pois','admin1','admin2','population','traffic')),
      ADD CONSTRAINT enrichment_imports_check CHECK
        ((layer = 'population') = (raster_path IS NOT NULL)),
      ADD CONSTRAINT enrichment_imports_check1 CHECK
        (layer <> 'population' OR unit = 'persons_per_pixel')`);
  }
}

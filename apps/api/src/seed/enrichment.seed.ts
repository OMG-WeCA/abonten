import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';

/** Synthetic examples for schema/import inspection only, NEVER production context. */
export async function seedEnrichment(dataSource: DataSource): Promise<void> {
  const samples = [
    { id: 'e9000000-0000-4000-8000-000000000001', country: 'GH', lon: -0.19, lat: 5.6 },
    { id: 'e9000000-0000-4000-8000-000000000002', country: 'NG', lon: 3.42, lat: 6.43 },
  ];
  for (const sample of samples) {
    const geo = { type: 'Point', coordinates: [sample.lon, sample.lat] };
    const properties = { name: 'DEMO: fictional clinic', category: 'healthcare', synthetic: true };
    const payload = JSON.stringify({ geo, properties });
    const checksum = createHash('sha256').update(payload).digest('hex');
    await dataSource.transaction(async (manager) => {
      const inserted: { id: string }[] = await manager.query(
        `INSERT INTO enrichment_imports
        (id,country_code,source_key,layer,data_class,version,reference_year,published_at,fetched_at,licence,licence_url,attribution,source_url,
         checksum,original_crs,coverage,unit,quality,warnings,feature_count,active,operator)
        VALUES ($1,$2,'demo-fixture','pois','demo','demo-v1',2026,NULL,'2026-09-30T00:00:00Z','Synthetic demo','https://example.invalid/demo',
          'Fictional Abonten demo; not sourced observations','https://example.invalid/demo',$3,'EPSG:4326',
          ST_Multi(ST_MakeEnvelope($4::double precision-.01,$5::double precision-.01,$4::double precision+.01,$5::double precision+.01,4326)),
          'features','mapped','["Synthetic demonstration only. Excluded from all production context."]'::jsonb,1,true,'seed:demo')
        ON CONFLICT DO NOTHING RETURNING id`,
        [sample.id, sample.country, checksum, sample.lon, sample.lat],
      );
      if (!inserted.length) return;
      await manager.query(
        `INSERT INTO enrichment_features(import_id,external_id,geom,properties)
        VALUES ($1,'demo:clinic',ST_SetSRID(ST_GeomFromGeoJSON($2),4326),$3::jsonb)`,
        [sample.id, JSON.stringify(geo), JSON.stringify(properties)],
      );
      await manager.query(
        `INSERT INTO audit_logs(action,entity_type,entity_id,after) VALUES
        ('enrichment.demo.seeded','enrichment_import',$1,$2::json)`,
        [sample.id, JSON.stringify({ country: sample.country, dataClass: 'demo', checksum })],
      );
    });
  }
}

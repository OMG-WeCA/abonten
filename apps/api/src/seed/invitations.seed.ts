import type { DataSource } from 'typeorm';
import { IDS } from './seed-ids';
/** Local fixture invitations only. Never sends mail or rewrites acceptance history. */
export async function seedInvitations(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT INTO invitations(id,email,name,organization_id,role,locale,status,expires_at,created_by_user_id,created_by_org_id,delivery)
 VALUES('99999999-0000-4000-8000-000000000001','amina@palmline.example','Amina Balogun',$1,'inventory_manager','en','pending',now()+interval '7days',$2,$3,'not_sent'),
 ('99999999-0000-4000-8000-000000000002','laurent@horizon.example','Laurent Mendy',$1,'field_operator','fr','pending',now()-interval '1day',$2,$3,'not_sent')
 ON CONFLICT DO NOTHING`,
    [IDS.org.accraOutdoor, IDS.user.adaora, IDS.org.omgWeca],
  );
  console.log('  invitations: insert-only local fixtures; no email sent');
}

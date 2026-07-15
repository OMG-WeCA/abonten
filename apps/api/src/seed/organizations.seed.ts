import { DataSource } from 'typeorm';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { IDS } from './seed-ids';

const ORGS = [
  {
    id: IDS.org.accraOutdoor,
    name: 'Accra Outdoor Media',
    type: 'media_partner',
    country: 'Ghana',
    defaultCurrency: 'GHS',
    defaultLocale: 'en',
    status: 'active',
    allowedEmailDomains: ['accraoutdoor.com'],
  },
  {
    id: IDS.org.mediareach,
    name: 'mediaReach OMD Lagos',
    type: 'agency',
    country: 'Nigeria',
    defaultCurrency: 'NGN',
    defaultLocale: 'en',
    status: 'active',
    allowedEmailDomains: ['mediareach.com'],
  },
  {
    id: IDS.org.unilever,
    name: 'Unilever West Africa',
    type: 'brand',
    country: 'Nigeria',
    defaultCurrency: 'NGN',
    defaultLocale: 'en',
    status: 'active',
    allowedEmailDomains: ['unilever.com'],
  },
  {
    id: IDS.org.omgWeca,
    name: 'OMG WeCA',
    type: 'platform',
    country: 'Nigeria',
    defaultCurrency: 'NGN',
    defaultLocale: 'en',
    status: 'active',
    allowedEmailDomains: ['omg-weca.com'],
  },
];

export async function seedOrganizations(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(OrganizationEntity);
  for (const o of ORGS) {
    await repo.save(repo.create(o));
  }
  console.log(`  organizations: ${ORGS.length}`);
}

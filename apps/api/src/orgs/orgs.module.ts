import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgsController } from './orgs.controller';
import { PartnerTermsService } from './partner-terms.service';
import {
  PartnerTermsController,
  OrganizationPartnerTermsController,
} from './partner-terms.controller';
import { OrgsService } from './orgs.service';

@Module({
  imports: [AuthModule], // for EmailCodeService and canonical invitation identities
  controllers: [OrgsController, PartnerTermsController, OrganizationPartnerTermsController],
  providers: [OrgsService, PartnerTermsService],
})
export class OrgsModule {}

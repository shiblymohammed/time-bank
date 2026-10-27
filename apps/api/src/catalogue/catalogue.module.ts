import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ServiceCategory } from './entities/service-category.entity';
import { GlobalServiceDefinition } from './entities/global-service-definition.entity';
import { OrganizationServiceCatalog } from './entities/organization-service-catalog.entity';
import { OrganizationServiceProposal } from './entities/organization-service-proposal.entity';
import { Organization } from '../organizations/entities/organization.entity';

import { CatalogueService } from './catalogue.service';
import { CatalogueController } from './catalogue.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceCategory,
      GlobalServiceDefinition,
      OrganizationServiceCatalog,
      OrganizationServiceProposal,
      Organization,
    ]),
    AuditModule,
    AuthorizationModule,
  ],
  controllers: [CatalogueController],
  providers: [CatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}

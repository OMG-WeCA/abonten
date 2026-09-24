import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DatabaseService } from '../common/database.service';
import { MarketEntity } from '../common/entities/market.entity';

/**
 * Read-only market/zone reference list (SPEC §5.1: "market/zone" is a captured
 * site attribute). Markets are shared platform reference data, so any
 * authenticated user may list them; writes are not exposed.
 */
@ApiTags('markets')
@Controller('markets')
export class MarketsController {
  constructor(private readonly db: DatabaseService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(): Promise<{ items: Array<{ id: string; name: string; country: string }> }> {
    const repo = await this.db.repo(MarketEntity);
    const rows = await repo.find({ order: { name: 'ASC' } });
    return {
      items: rows.map((m) => ({ id: m.id, name: m.name, country: m.country })),
    };
  }
}
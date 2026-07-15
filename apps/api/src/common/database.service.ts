import { Injectable } from '@nestjs/common';
import { DataSource, EntityTarget, ObjectLiteral, Repository } from 'typeorm';

// Lazy repository access: the DataSource connects on first use, so the API boots
// in dev even without a running database.
@Injectable()
export class DatabaseService {
  constructor(private readonly dataSource: DataSource) {}

  async repo<T extends ObjectLiteral>(target: EntityTarget<T>): Promise<Repository<T>> {
    if (!this.dataSource.isInitialized) {
      await this.dataSource.initialize();
    }
    return this.dataSource.getRepository(target);
  }
}

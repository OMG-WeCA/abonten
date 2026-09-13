import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';

// Lazy repository access: the DataSource connects on first use, so the API boots
// in dev even without a running database.
@Injectable()
export class DatabaseService {
  constructor(private readonly dataSource: DataSource) {}

  async repo<T extends ObjectLiteral>(target: EntityTarget<T>): Promise<Repository<T>> {
    await this.ensureInitialized();
    return this.dataSource.getRepository(target);
  }

  async transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    await this.ensureInitialized();
    return this.dataSource.transaction(work);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.dataSource.isInitialized) {
      await this.dataSource.initialize();
    }
  }
}

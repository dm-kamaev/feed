import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { CombinedFeedData } from './types';

@Injectable()
export class FeedRepository {
  constructor(@InjectRedis() public readonly redis: Redis) {}

  private getFeedKey(query: string): string {
    return `feed:${query}`;
  }

  private getLockKey(query: string): string {
    return `lock:${query}`;
  }

  async getFeed(query: string): Promise<CombinedFeedData | null> {
    const cached = await this.redis.get(this.getFeedKey(query));
    if (cached) {
      return JSON.parse(cached) as CombinedFeedData;
    }
    return null;
  }

  async setFeed(query: string, data: CombinedFeedData): Promise<void> {
    await this.redis.set(
      this.getFeedKey(query),
      JSON.stringify(data),
      'EX',
      3600,
    );
  }

  async acquireLock(query: string): Promise<boolean> {
    const result = await this.redis.set(
      this.getLockKey(query),
      'locked',
      'EX',
      30,
      'NX',
    );
    return result === 'OK';
  }

  async prolongLock(query: string): Promise<void> {
    await this.redis.expire(this.getLockKey(query), 30);
  }

  async releaseLock(query: string): Promise<void> {
    await this.redis.del(this.getLockKey(query));
  }
}

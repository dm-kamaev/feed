import { FeedRepository } from '../../../src/feed/feed.repository';

export class FeedRepositoryFake extends FeedRepository {
  async truncate() {
    const [feedKeys, lockKeys] = await Promise.all([
      this.redis.keys(`feed:*`),
      this.redis.keys(`lock:*`),
    ]);

    if (feedKeys.length > 0) {
      await this.redis.del(...feedKeys);
    }

    if (lockKeys.length > 0) {
      await this.redis.del(...lockKeys);
    }

    return Promise.resolve([0, 0]);
  }
}

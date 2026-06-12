import { Injectable } from '@nestjs/common';
import { FeedRepository } from './feed.repository';
import { CombinedFeedData } from './types';

@Injectable()
export class FeedSearchService {
  constructor(private readonly feedRepository: FeedRepository) {}

  async search(query: string): Promise<CombinedFeedData | null> {
    const cachedData = await this.feedRepository.getFeed(query);
    if (cachedData) {
      return cachedData;
    }

    return null;
  }
}

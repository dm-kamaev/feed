import { Injectable } from '@nestjs/common';
import { FeedRepository } from './feed.repository';
import { CombinedFeedData } from './types';

@Injectable()
export class FeedSearchService {
  constructor(private readonly feedRepository: FeedRepository) {}

  async act(query: string): Promise<CombinedFeedData | null> {
    return await this.feedRepository.getFeed(query);
  }
}

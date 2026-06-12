import { FeedApi } from '../../../src/feed/feed.api';
import { AxiosHeaders } from 'axios';
import { SearchResponse } from '../../../src/feed/types';
import { RateLimitException } from '../../../src/feed/exceptions/rate-limit.exception';

export class FeedApiFake extends FeedApi {
  static defaultFeed: Record<string, SearchResponse> = {
    dog: {
      items: [
        {
          url: 'http://example.com/dog1.jpg',
          width: 100,
          height: 100,
          tags: ['dog'],
        },
      ],
    },
    'dog graffiti': {
      items: [
        {
          url: 'http://example.com/dog_graffiti1.jpg',
          width: 200,
          height: 200,
          tags: ['dog', 'graffiti'],
        },
      ],
    },
  };

  override async search(query: string) {
    if (query === 'rate-limit-test') {
      throw new RateLimitException();
    }

    if (query === 'dog') {
      return Promise.resolve({
        data: FeedApiFake.defaultFeed['dog'],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: new AxiosHeaders(),
        },
      });
    } else if (query === 'dog graffiti') {
      return Promise.resolve({
        data: FeedApiFake.defaultFeed['dog graffiti'],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: new AxiosHeaders(),
        },
      });
    }
    return Promise.resolve({
      data: { items: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {
        headers: new AxiosHeaders(),
      },
    });
  }
}

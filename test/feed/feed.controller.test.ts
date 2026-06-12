import request from 'supertest';
import { Test } from '@nestjs/testing';
import { FeedModule } from '../../src/feed/feed.module';
import { FeedApi } from '../../src/feed/feed.api';
import { FeedView } from '../../src/feed/feed.view';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { RedisModule } from '@nestjs-modules/ioredis';
import { ConfigModule } from '@nestjs/config';
import { FeedRepository } from '../../src/feed/feed.repository';
import { CombinedFeedData } from '../../src/feed/types';
import { FeedRepositoryFake } from '../fake/feed/feed.repository';
import { FeedApiFake } from '../fake/feed/feed.api';

describe('feed.controller', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        FeedModule,
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
        RedisModule.forRoot({
          type: 'single',
          url: process.env['REDIS_URL'] || 'redis://localhost:6379',
        }),
      ],
    })
      .overrideProvider(FeedApi)
      .useClass(FeedApiFake)
      .overrideProvider(FeedRepository)
      .useClass(FeedRepositoryFake)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready(); // Fastify specific readiness
  });

  beforeEach(async () => {
    const feedRepository = app.get<FeedRepository, FeedRepositoryFake>(
      FeedRepository,
    );
    await feedRepository.truncate();
  });

  it(`GET feed/search (Cache Hit)`, async () => {
    const query = 'cat';
    const stubCache: CombinedFeedData = {
      left: FeedApiFake.defaultFeed['dog'].items,
      right: FeedApiFake.defaultFeed['dog graffiti'].items,
    };

    const feedRepository = app.get<FeedRepository, FeedRepositoryFake>(
      FeedRepository,
    );
    await feedRepository.setFeed(query, stubCache);

    const feedView = app.get(FeedView);
    const feedViewSpy = jest.spyOn(feedView, 'renderFullFeedTemplate');

    const feedApi = app.get(FeedApi);
    const feedApiSpy = jest.spyOn(feedApi, 'search');

    await request(app.getHttpServer())
      .get('/feed/search?query=' + query)
      .expect(200);

    expect(feedViewSpy).toHaveBeenCalledWith(stubCache);
    expect(feedApiSpy).not.toHaveBeenCalled();
  });

  // Add a test for Cache Miss scenario
  it(`GET feed/search (Cache Miss) and SSE Stream`, async () => {
    const query = 'dog';

    const feedView = app.get(FeedView);
    const placeholderSpy = jest.spyOn(feedView, 'renderPlaceholderTemplate');
    const columnSpy = jest.spyOn(feedView, 'renderColumnHtml');

    // 1. Initial search - expect placeholder (cache miss)
    await request(app.getHttpServer())
      .get('/feed/search?query=' + query)
      .expect(200);

    expect(placeholderSpy).toHaveBeenCalledWith(query);

    const sseUrl = `/feed/in_progress?query=${query}`;
    await request(app.getHttpServer()).get(sseUrl);

    expect(columnSpy).toHaveBeenCalledTimes(2);
    expect(columnSpy).toHaveBeenCalledWith(
      FeedApiFake.defaultFeed['dog'].items,
    );
    expect(columnSpy).toHaveBeenCalledWith(
      FeedApiFake.defaultFeed['dog graffiti'].items,
    );

    const feedRepository = app.get<FeedRepository, FeedRepositoryFake>(
      FeedRepository,
    );

    // Verify cache was populated
    const cachedData = await feedRepository.getFeed(query);
    expect(cachedData).toEqual({
      left: FeedApiFake.defaultFeed['dog'].items,
      right: FeedApiFake.defaultFeed['dog graffiti'].items,
    });
  }, 30000); // Increased timeout for SSE test

  it('GET feed/search with empty query should return an empty feed', async () => {
    const feedView = app.get(FeedView);
    const expectedHtml = feedView.renderFullFeedTemplate({
      left: [],
      right: [],
    });

    const response = await request(app.getHttpServer())
      .get('/feed/search?query=')
      .expect(200);

    expect(response.text).toEqual(expectedHtml);

    const whitespaceResponse = await request(app.getHttpServer())
      .get('/feed/search?query=%20%20')
      .expect(200);

    expect(whitespaceResponse.text).toEqual(expectedHtml);
  });

  it('should correctly URL-encode special characters in the query', async () => {
    const specialQuery = 'dogs & cats "friends"';
    const encodedQuery = encodeURIComponent(specialQuery);

    const response = await request(app.getHttpServer())
      .get('/feed/search')
      .query({ query: specialQuery })
      .expect(200);

    // Check that the placeholder's sse-connect attribute has the encoded query
    expect(response.text).toContain(
      `sse-connect="/api/feed/in_progress?query=${encodedQuery}"`,
    );
  });

  it('should handle rate limit errors gracefully in a column', async () => {
    const query = 'rate-limit-test';

    // The initial search will return a placeholder
    await request(app.getHttpServer())
      .get(`/feed/search?query=${query}`)
      .expect(200);

    // Now we connect to the SSE stream and expect the rate-limit error
    // to be delivered via a 'left-ready' event.
    const sseResponse = await request(app.getHttpServer())
      .get(`/feed/in_progress?query=${query}`)
      .expect(200);

    // Check that the error message is delivered using the 'left-ready' event
    expect(sseResponse.text).toContain('event: left-ready');
    expect(sseResponse.text).toContain(
      'data: <p class="has-text-danger has-text-centered">Service is busy, please try again in a moment.</p>',
    );
    // Also check that the right column still loads successfully
    expect(sseResponse.text).toContain('event: right-ready');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });
});

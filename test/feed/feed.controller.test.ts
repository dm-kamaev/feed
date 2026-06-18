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

jest.mock('node:timers/promises', () => ({
  setTimeout: jest.fn(() => Promise.resolve()),
}));

let consoleErrorSpy: jest.SpyInstance;

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

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
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
    const feedViewSpy = jest.spyOn(feedView, 'renderFullFeed');

    const feedApi = app.get(FeedApi);
    const feedApiSpy = jest.spyOn(feedApi, 'search');

    await request(app.getHttpServer())
      .get('/feed/search?query=' + query)
      .expect(200);

    expect(feedViewSpy).toHaveBeenCalledWith(stubCache);
    expect(feedApiSpy).not.toHaveBeenCalled();

    feedViewSpy.mockRestore();
    feedApiSpy.mockRestore();
  });

  // Add a test for Cache Miss scenario
  it(`GET feed/search (Cache Miss) and SSE Stream`, async () => {
    const query = 'dog';

    const feedView = app.get(FeedView);
    const placeholderSpy = jest.spyOn(feedView, 'renderPlaceholder');
    const columnSpy = jest.spyOn(feedView, 'renderFeedColumn');

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

    placeholderSpy.mockRestore();
    columnSpy.mockRestore();
  });

  it('GET feed/search with empty query should return an empty feed', async () => {
    const feedView = app.get(FeedView);
    const expectedHtml = feedView.renderFullFeed({
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
    const feedView = app.get(FeedView);
    const expectedRateLimitErrorHtml = feedView.renderError(
      'Service is busy, please try again in a moment.',
    );

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
    expect(sseResponse.text).toContain(`data: ${expectedRateLimitErrorHtml}`);
    // Also check that the right column still loads successfully
    expect(sseResponse.text).toContain('event: right-ready');
  });

  it(`GET feed/in_progress (Cache Hit) should return cached data immediately without calling API`, async () => {
    const query = 'cat';
    const stubCache: CombinedFeedData = {
      left: FeedApiFake.defaultFeed['dog'].items,
      right: FeedApiFake.defaultFeed['dog graffiti'].items,
    };

    const feedRepository = app.get<FeedRepository, FeedRepositoryFake>(
      FeedRepository,
    );
    await feedRepository.setFeed(query, stubCache);

    const feedApi = app.get(FeedApi);
    const feedApiSpy = jest.spyOn(feedApi, 'search');

    const sseResponse = await request(app.getHttpServer())
      .get(`/feed/in_progress?query=${query}`)
      .expect(200);

    expect(sseResponse.text).toContain('event: left-ready');
    expect(sseResponse.text).toContain('event: right-ready');
    expect(sseResponse.text).toContain('event: complete');
    expect(sseResponse.text).toContain('http://example.com/dog1.jpg');
    expect(sseResponse.text).toContain('http://example.com/dog_graffiti1.jpg');
    expect(feedApiSpy).not.toHaveBeenCalled();

    feedApiSpy.mockRestore();
  });

  it('should handle acquireLock failure gracefully with error messages and no releaseLock', async () => {
    const query = 'lock-fail-test';
    const errorMessage = 'Could not process request, please try again later.';

    const feedRepository = app.get<FeedRepository, FeedRepositoryFake>(
      FeedRepository,
    );
    const acquireLockSpy = jest
      .spyOn(feedRepository, 'acquireLock')
      .mockResolvedValue(false); // Simulate lock acquisition failure

    const releaseLockSpy = jest.spyOn(feedRepository, 'releaseLock'); // Spy on releaseLock

    const feedView = app.get(FeedView);
    const expectedErrorHtml = feedView.renderError(errorMessage);

    // Initial search to trigger the stream creation and placeholder
    await request(app.getHttpServer())
      .get(`/feed/search?query=${query}`)
      .expect(200);

    // Connect to the SSE stream to trigger _processStream
    const sseResponse = await request(app.getHttpServer())
      .get(`/feed/in_progress?query=${query}`)
      .expect(200);

    // Expect multiple calls to acquireLock due to retries
    expect(acquireLockSpy).toHaveBeenCalledTimes(6); // 1 initial + 5 retries

    expect(sseResponse.text).toContain('event: left-ready');
    expect(sseResponse.text).toContain(`data: ${expectedErrorHtml}`);
    expect(sseResponse.text).toContain('event: right-ready');
    expect(sseResponse.text).toContain(`data: ${expectedErrorHtml}`);

    // Assert that releaseLock was NOT called, as the lock was never acquired
    expect(releaseLockSpy).not.toHaveBeenCalled();

    acquireLockSpy.mockRestore(); // Clean up the mock
    releaseLockSpy.mockRestore(); // Clean up the spy
  });

  afterAll(async () => {
    if (app) {
      consoleErrorSpy.mockRestore(); // Restore original console.error
      await app.close();
    }
  });
});

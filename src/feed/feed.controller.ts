import { Controller, Get, Query, Res, Sse } from '@nestjs/common';
import { FeedSearchService } from './feed-search.service';
import { FeedStream } from './feed-stream.service';
import { FeedView } from './feed.view';
import type { Response } from 'express';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { FeedMessageEvent, SseMessage } from './types';

@Controller('feed')
export class FeedController {
  constructor(
    private readonly feedSearchService: FeedSearchService,
    private readonly feedStreamService: FeedStream,
    private readonly feedViewService: FeedView,
  ) {}

  @Get('search')
  async search(@Query('query') inputQuery: string, @Res() res: Response) {
    const query = (inputQuery || '').toLowerCase().trim();

    if (!query) {
      return res.send(
        this.feedViewService.renderFullFeedTemplate({ left: [], right: [] }),
      );
    }

    const cachedData = await this.feedSearchService.search(query);

    if (cachedData) {
      return res.send(this.feedViewService.renderFullFeedTemplate(cachedData));
    }

    // Cache Miss: Return a lazy-loading placeholder that activates htmx SSE extension
    return res.send(this.feedViewService.renderPlaceholderTemplate(query));
  }

  @Sse('in_progress')
  streamInProgress(@Query('query') inputQuery: string): Observable<SseMessage> {
    const query = (inputQuery || '').toLowerCase().trim();

    if (!query) {
      // If query is empty, return a stream that closes immediately
      return of(this.feedViewService.emptySseMessageStream());
    }

    return this.feedStreamService.stream(query).pipe(
      map((message: FeedMessageEvent): SseMessage => {
        return this.feedViewService.mapFeedMessageToSseMessage(message);
      }),
    );
  }
}

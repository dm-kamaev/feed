import { Controller, Get, Query, Res, Sse } from '@nestjs/common';
import { FeedSearchService } from './feed-search.service';
import { FeedStreamService } from './feed-stream.service';
import { FeedView } from './feed.view';
import type { Response } from 'express';
import { from, Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { FeedMessageEvent, SseMessage, CombinedFeedData } from './types';

@Controller('feed')
export class FeedController {
  constructor(
    private readonly feedSearchService: FeedSearchService,
    private readonly feedStreamService: FeedStreamService,
    private readonly feedViewService: FeedView,
  ) {}

  @Get('search')
  async search(@Query('query') inputQuery: string, @Res() res: Response) {
    const query = (inputQuery || '').toLowerCase().trim();

    if (!query) {
      return res.send(
        this.feedViewService.renderFullFeed({ left: [], right: [] }),
      );
    }

    const cachedData = await this.feedSearchService.act(query);

    if (cachedData) {
      return res.send(this.feedViewService.renderFullFeed(cachedData));
    }

    // Cache Miss: Return a lazy-loading placeholder that activates htmx SSE extension
    return res.send(this.feedViewService.renderPlaceholder(query));
  }

  @Sse('in_progress')
  streamInProgress(@Query('query') inputQuery: string): Observable<SseMessage> {
    const query = (inputQuery || '').toLowerCase().trim();

    if (!query) {
      return of(this.feedViewService.emptySseMessage());
    }

    return from(this.feedSearchService.act(query)).pipe(
      mergeMap(
        (cachedData: CombinedFeedData | null): Observable<FeedMessageEvent> => {
          if (cachedData) {
            return from(this.feedViewService.cachedDataEvents(cachedData));
          }
          return this.feedStreamService.act(query);
        },
      ),
      mergeMap((message: FeedMessageEvent) => {
        const result = this.feedViewService.mapFeedMessageToSseMessage(message);
        return Array.isArray(result) ? from(result) : of(result);
      }),
    );
  }
}

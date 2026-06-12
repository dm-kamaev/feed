import { Injectable } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import { FeedApi } from './feed.api';
import { CombinedFeedData, FeedMessageEvent, ImageItem } from './types';
import { FeedRepository } from './feed.repository';
import { RateLimitException } from './exceptions/rate-limit.exception';

@Injectable()
export class FeedStream {
  private inFlightStreams = new Map<string, Observable<FeedMessageEvent>>();

  constructor(
    private readonly feedRepository: FeedRepository,
    private readonly feedApi: FeedApi,
  ) {}

  stream(query: string): Observable<FeedMessageEvent> {
    if (this.inFlightStreams.has(query)) {
      return this.inFlightStreams.get(query)!;
    }

    const newStream = new Observable<FeedMessageEvent>((subscriber) => {
      void this._processStream(query, subscriber);
    }).pipe(
      shareReplay({ bufferSize: 2, refCount: true }),
      tap({
        complete: () => {
          this.inFlightStreams.delete(query);
        },
        error: () => {
          this.inFlightStreams.delete(query);
        },
      }),
    );

    this.inFlightStreams.set(query, newStream);
    return newStream;
  }

  private async _processStream(
    query: string,
    subscriber: Subscriber<FeedMessageEvent>,
  ) {
    let lockAcquired = false;
    try {
      lockAcquired = await this.feedRepository.acquireLock(query);
      if (!lockAcquired) {
        // ... same logic for when lock is not acquired ...
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const cachedData = await this.feedRepository.getFeed(query);
        if (cachedData) {
          subscriber.next({ type: 'left-ready', data: cachedData.left });
          subscriber.next({ type: 'right-ready', data: cachedData.right });
        }
        subscriber.next({ type: 'complete', data: '' });
        subscriber.complete();
        return;
      }

      const leftPromise = this.feedApi
        .search(query)
        .then((result) => {
          const leftData = result.data.items;
          subscriber.next({ type: 'left-ready', data: leftData });
          return leftData;
        })
        .catch((error: unknown) => {
          const message =
            error instanceof RateLimitException
              ? 'Service is busy, please try again in a moment.'
              : (error as Error).message;

          console.error(`Error fetching left feed for "${query}":`, error);
          subscriber.next({
            type: 'error',
            data: { source: 'left', message },
          });
          return [] as ImageItem[];
        });

      const rightPromise = this.feedApi
        .search(`${query} graffiti`)
        .then((result) => {
          const rightData = result.data.items;
          subscriber.next({ type: 'right-ready', data: rightData });
          return rightData;
        })
        .catch((error: unknown) => {
          const message =
            error instanceof RateLimitException
              ? 'Service is busy, please try again in a moment.'
              : (error as Error).message;
          console.error(
            `Error fetching right feed for "${query} graffiti":`,
            error,
          );
          subscriber.next({
            type: 'error',
            data: { source: 'right', message },
          });
          return [] as ImageItem[];
        });

      const [left, right] = await Promise.all([leftPromise, rightPromise]);

      const combinedData: CombinedFeedData = { left, right };
      if (left.length > 0 || right.length > 0) {
        await this.feedRepository.setFeed(query, combinedData);
      }
      subscriber.next({ type: 'complete', data: '' });
      subscriber.complete();
    } catch (error) {
      console.error('Error in SSE stream:', error);
      subscriber.error(error);
    } finally {
      if (lockAcquired) {
        await this.feedRepository.releaseLock(query);
      }
    }
  }
}


import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import { FeedApi } from './feed.api';
import { CombinedFeedData, ImageItem, FeedMessageEvent } from './types';
import { FeedRepository } from './feed.repository';

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
    subscriber: {
      next(value: FeedMessageEvent): void;
      error(err?: any): void;
      complete(): void;
    },
  ) {
    let lockAcquired = false;
    try {
      lockAcquired = await this.feedRepository.acquireLock(query);
      if (!lockAcquired) {
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
        .catch((throwable: unknown) => {
          const error = throwable as Error;
          console.error(`Error fetching left feed for "${query}":`, error);
          subscriber.next({
            type: 'error',
            data: { source: 'left', message: error.message },
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
        .catch((throwable: unknown) => {
          const error = throwable as Error;
          console.error(
            `Error fetching right feed for "${query} graffiti":`,
            error,
          );
          subscriber.next({
            type: 'error',
            data: { source: 'right', message: error.message },
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

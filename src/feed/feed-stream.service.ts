import { Injectable } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import { setTimeout } from 'node:timers/promises';
import { FeedApi } from './feed.api';
import { CombinedFeedData, FeedMessageEvent, ImageItem } from './types';
import { FeedRepository } from './feed.repository';
import { RateLimitException } from './exceptions/rate-limit.exception';

@Injectable()
export class FeedStreamService {
  private inFlightStreams = new Map<string, Observable<FeedMessageEvent>>();

  constructor(
    private readonly feedRepository: FeedRepository,
    private readonly feedApi: FeedApi,
  ) {}

  act(query: string): Observable<FeedMessageEvent> {
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
      lockAcquired = await this._acquireLockWithRetries(query, subscriber);
      if (!lockAcquired) {
        return;
      }

      const prolongTimer = setInterval(() => {
        this.feedRepository.prolongLock(query).catch((error) => {
          console.error(`Failed to prolong lock for "${query}":`, error);
        });
      }, 1000);

      try {
        const leftPromise = this.feedApi
          .search(query)
          .then((result) => {
            const leftData = result.data.items;
            subscriber.next({ type: 'left-ready', data: leftData });
            return leftData;
          })
          .catch((error: unknown) => {
            const message = this._getErrorMessage(error);

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
            const message = this._getErrorMessage(error);
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
        subscriber.next({ type: 'complete', data: 'done' });
        subscriber.complete();
      } finally {
        clearInterval(prolongTimer);
      }
    } catch (error: unknown) {
      const message = this._getErrorMessage(error);

      console.error('Error in SSE stream:', error);
      subscriber.next({
        type: 'error',
        data: { source: 'global', message },
      });
      subscriber.complete();
    } finally {
      if (lockAcquired) {
        await this.feedRepository.releaseLock(query);
      }
    }
  }

  private async _acquireLockWithRetries(
    query: string,
    subscriber: Subscriber<FeedMessageEvent>,
  ): Promise<boolean> {
    // Values depending on how long external service responding
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 1000;
    let lockAcquired = false;

    // Initial attempt to acquire the lock
    lockAcquired = await this.feedRepository.acquireLock(query);

    // If lock is not acquired, enter the retry loop
    if (!lockAcquired) {
      for (let i = 0; i < MAX_RETRIES; i++) {
        await setTimeout(RETRY_DELAY_MS);

        const cachedData = await this.feedRepository.getFeed(query);
        if (cachedData) {
          subscriber.next({ type: 'left-ready', data: cachedData.left });
          subscriber.next({ type: 'right-ready', data: cachedData.right });
          subscriber.next({ type: 'complete', data: 'done' });
          subscriber.complete();
          return false; // Cached data served, no need to acquire lock
        }

        // Cache is empty, try to acquire lock again
        lockAcquired = await this.feedRepository.acquireLock(query);
        if (lockAcquired) {
          // Lock acquired on a retry, break the loop and proceed to fetch data
          break;
        }
      }
    }

    // After the initial try and potential retries, check if we have the lock
    if (!lockAcquired) {
      const errorMessage = 'Could not process request, please try again later.';
      console.error(
        `Could not acquire lock for query "${query}" after ${MAX_RETRIES} retries.`,
      );
      subscriber.next({
        type: 'error',
        data: {
          source: 'left',
          message: errorMessage,
        },
      });
      subscriber.next({
        type: 'error',
        data: {
          source: 'right',
          message: errorMessage,
        },
      });
      subscriber.complete();
      return false; // Lock not acquired, and error sent
    }

    return true; // Lock successfully acquired
  }

  private _getErrorMessage(
    error: unknown,
    defaultMessage: string = 'An unknown error occurred.',
  ): string {
    if (error instanceof RateLimitException) {
      return 'Service is busy, please try again in a moment.';
    }
    if (error instanceof Error) {
      return error.message;
    }
    return defaultMessage;
  }
}

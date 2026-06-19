import { Injectable } from '@nestjs/common';
import {
  ImageItem,
  CombinedFeedData,
  FeedMessageEvent,
  SseMessage,
} from './types';

@Injectable()
export class FeedView {
  renderFullFeed(data: CombinedFeedData): string {
    return `
      <div class="columns">
        <div id="left-col" class="column is-6">
          ${this.renderFeedColumn(data.left)}
        </div>
        <div id="right-col" class="column is-6">
          ${this.renderFeedColumn(data.right)}
        </div>
      </div>
    `;
  }

  renderFeedColumn(items: ImageItem[]): string {
    if (!items || items.length === 0) {
      return '<p>No images found.</p>';
    }
    return items
      .map(
        (item) => `
          <div class="card mb-4">
            <div class="card-image">
              <figure class="image is-4by3">
                <img src="${item.url}" alt="Image with tags: ${item.tags.join(
                  ', ',
                )}">
              </figure>
            </div>
            <div class="card-content">
              <div class="tags">
                ${item.tags
                  .map((tag: string) => `<span class="tag">${tag}</span>`)
                  .join(' ')}
              </div>
            </div>
          </div>`,
      )
      .join('');
  }

  renderError(message: string): string {
    const sanitizedMessage = this.escapeHtml(message);
    return `<p class="has-text-danger has-text-centered">${sanitizedMessage}</p>`;
  }

  mapFeedMessageToSseMessage(
    message: FeedMessageEvent,
  ): SseMessage | SseMessage[] {
    if (message.type === 'left-ready' || message.type === 'right-ready') {
      return {
        type: message.type,
        data: this.renderFeedColumn(message.data),
      };
    } else if (message.type === 'error') {
      const errorHtml = this.renderError(message.data.message);

      if (message.data.source === 'left') {
        return { type: 'left-ready', data: errorHtml };
      } else if (message.data.source === 'right') {
        return { type: 'right-ready', data: errorHtml };
      } else if (message.data.source === 'global') {
        return [
          { type: 'left-ready', data: errorHtml },
          { type: 'right-ready', data: errorHtml },
        ];
      } else {
        throw new Error(`UNHANDLED message ${JSON.stringify(message)}`);
      }
    }
    // else if (message.type === 'complete') {
    //   return { type: 'complete', data: '' };
    // }
    //  else {
    //   throw new Error(`UNHANDLED message ${JSON.stringify(message)}`);
    // }

    // Ensure data is non-empty so NestJS writes the `data:` SSE line
    // (empty data causes the line to be omitted, breaking sse-close detection)
    if (message.type === 'complete') {
      if (typeof message.data === 'string' && message.data.length === 0) {
        return { type: 'complete', data: 'done' };
      }
      return message;
    }

    return message;
  }

  cachedDataEvents(data: CombinedFeedData): FeedMessageEvent[] {
    return [
      { type: 'left-ready', data: data.left },
      { type: 'right-ready', data: data.right },
      { type: 'complete', data: 'done' },
    ];
  }

  emptySseMessage(): SseMessage {
    return { type: 'complete', data: 'done' };
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  renderPlaceholder(query: string): string {
    const encodedQuery = encodeURIComponent(query);
    return `
      <div hx-ext="sse" sse-connect="/api/feed/in_progress?query=${encodedQuery}" sse-close="complete" class="box">
        <div class="columns">
          <div sse-swap="left-ready" id="left-col" class="column is-6">
            <p class="has-text-centered">Loading original posts...</p>
            <progress class="progress is-small is-primary" max="100">15%</progress>
          </div>
          <div sse-swap="right-ready" id="right-col" class="column is-6">
            <p class="has-text-centered">Waiting for graffiti variants...</p>
            <progress class="progress is-small is-link" max="100">15%</progress>
          </div>
        </div>
      </div>
    `;
  }
}

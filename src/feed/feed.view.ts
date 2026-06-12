import { Injectable } from '@nestjs/common';
import {
  ImageItem,
  CombinedFeedData,
  FeedMessageEvent,
  SseMessage,
} from './types';

@Injectable()
export class FeedView {
  renderFullFeedTemplate(data: CombinedFeedData): string {
    return `
      <div class="columns">
        <div id="left-col" class="column is-6">
          ${this.renderColumnHtml(data.left)}
        </div>
        <div id="right-col" class="column is-6">
          ${this.renderColumnHtml(data.right)}
        </div>
      </div>
    `;
  }

  renderColumnHtml(items: ImageItem[]): string {
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

  mapFeedMessageToSseMessage(message: FeedMessageEvent): SseMessage {
    if (message.type === 'left-ready' || message.type === 'right-ready') {
      return {
        type: message.type,
        data: this.renderColumnHtml(message.data),
      };
    }

    if (message.type === 'error') {
      const errorHtml = this.renderError(message.data.message);
      // Reuse the success event type for the corresponding column to deliver the error message
      const eventType =
        message.data.source === 'left' ? 'left-ready' : 'right-ready';
      return {
        type: eventType,
        data: errorHtml,
      };
    }

    return message; // Pass through 'complete' events
  }

  emptySseMessageStream(): SseMessage {
    return { type: 'complete', data: '' };
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  renderPlaceholderTemplate(query: string): string {
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

// The generic SSE message format that NestJS expects as an output from the controller
export interface SseMessage {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

// Based on the OpenAPI spec
export interface ImageItem {
  url: string;
  width: number;
  height: number;
  tags: string[];
}

export interface SearchResponse {
  items: ImageItem[];
}

export interface CombinedFeedData {
  left: ImageItem[];
  right: ImageItem[];
}

// --- Discriminated Union for our internal feed events ---

// A base interface that our specific events can share
interface BaseFeedEvent {
  id?: string;
  retry?: number;
}

export interface LeftReadyMessage extends BaseFeedEvent {
  type: 'left-ready';
  data: ImageItem[];
}

export interface RightReadyMessage extends BaseFeedEvent {
  type: 'right-ready';
  data: ImageItem[];
}

export interface ErrorMessage extends BaseFeedEvent {
  type: 'error';
  data: { source: string; message: string };
}

export interface CompleteMessage extends BaseFeedEvent {
  type: 'complete';
  data: string; // The complete event has empty data
}

export interface RateLimitMessage extends BaseFeedEvent {
  type: 'rate-limit';
  data: string;
}

// The discriminated union of all possible feed events
export type FeedMessageEvent =
  | LeftReadyMessage
  | RightReadyMessage
  | ErrorMessage
  | CompleteMessage;

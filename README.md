# Feed

http://localhost:8080/

## Setup

```sh
make install setup-env API_TOKEN=<....>
```

## Management

```sh
make down up logs; # Open in browser http://localhost:8080/
```

## Test

```sh
make test
make test.coverage
make test.watch
```

## Architectural Decisions

Key architectural patterns and technologies include:
- **Redis**: A Redis instance is used for two primary purposes:
  1.  **Caching**: To cache the results from the external feed API, reducing latency and avoiding repeated requests.
  2.  **Distributed Locking**: To ensure that only one app process attempts to fetch data for a specific query at a time, preventing race conditions and redundant work.
  3.  **TTL**. The requirements don't require strict consistency guarantees, but Redis has TTL out of the box.
- **Real-time Streaming with SSE**: For long-running operations like fetching external feeds, the application uses Server-Sent Events (SSE). The `feed/in_progress` endpoint pushes updates to the client as they become available, providing a responsive user experience.
- **Nest js**. Underhood Fastify js
- **Server-Side Rendering with htmx and Bulma(styling)**: Instead of a JSON API for a client-side framework, the backend renders HTML partials (using `FeedView`). The frontend is expected to use a library like `htmx` to handle user interactions and replace parts of the page.

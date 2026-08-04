# Async pipeline benchmarks

Run the free deterministic architecture benchmark:

```bash
npm run eval:async-pipeline
```

Run the real HTTP acknowledgement benchmark against a deployed environment:

```bash
BENCHMARK_BASE_URL="https://your-app.example" \
BENCHMARK_COOKIE="__session=..." \
BENCHMARK_TRIP_IDS="1,2,3,4,5,6,7,8,9,10,11,12" \
npm run eval:async-pipeline:http
```

Defaults are 2 warm-ups followed by 10 measured submissions with concurrency 5.
Every trip must be distinct, owned by the authenticated Clerk user, and have no
active generation job. Each successful request queues real itinerary generation
and can incur Gemini/Inngest usage. A Clerk bearer token can be supplied through
`BENCHMARK_AUTH_TOKEN` instead of `BENCHMARK_COOKIE`.

Options:

```text
--base-url <url>
--trip-ids <comma-separated ids>
--payload <generation-input.json>
--runs <count>
--warmups <count>
--concurrency <count>
--output <directory>
```

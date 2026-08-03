# GeminiGo

An AI trip planner: discover places, save activities, and generate full multi-day itineraries using Google Maps/Places data and Gemini.

## How it works

1. **Discover** — browse points of interest via Google Places, or search with natural language.
2. **Save** — build a shortlist of activities for a trip (drag-and-drop day assignment via `dnd-kit`).
3. **Generate** — Gemini turns your saved activities + trip constraints (dates, pace, hotel anchor) into a day-by-day itinerary, respecting venue opening hours and realistic travel/hike times between stops.
4. **Persist & iterate** — itineraries save to the trip, individual days can be regenerated, and everything survives a refresh.

POI search is backed by a retrieval-augmented pipeline: place data is embedded (`gemini-embedding-001`) and stored for semantic retrieval, so itinerary generation can pull in relevant, real venues rather than relying on the model's own (often stale) knowledge of a city.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Gemini** (`@google/genai`) for itinerary generation and POI embeddings
- **Google Maps / Places** for location data, markers, and directions
- **Clerk** for auth
- **Drizzle ORM** + Turso/libSQL for persistence
- **Inngest** for background jobs (async itinerary generation)
- **Zustand** for client state, **Vitest** for tests

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Gemini, Google Maps, Clerk, and DB credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Browser-visible Google Maps and Clerk keys must be restricted to your deployed domain(s).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | standard Next.js lifecycle |
| `npm run lint` / `npm test` | lint and unit tests |
| `npm run rag:backfill` | backfill POI embeddings for retrieval |
| `npm run eval` | run the itinerary-generation eval harness against golden scenarios |
| `npm run eval:retrieval` | score POI retrieval quality |

## Deployment

Dockerfile + `docker-compose.yml` included. Set every variable in `.env.example` (except Inngest keys, until async jobs are enabled) in your host's environment, and add each deployed domain to Clerk and to the Google Maps browser-key restrictions. After deploying, smoke-test sign-in, trip creation, activity selection, itinerary generation, persistence after refresh, day regeneration, map markers, and directions.

# Quant Demo + Market Data Pipeline

This repo now contains:

1. Consumer-facing H5 quant product demo (Opportunity / Performance / Safety / Market Temperature + standalone AI page).
2. Public-market data ingestion pipeline for quant research/signals.

The new pipeline downloads, normalizes, stores, validates, and serves OHLCV for:

- US equities/ETFs/indices (Stooq bulk packs)
- Crypto futures (Binance public data + Binance incremental REST)

## What Was Added

- Database schema + idempotent upsert logic
- Backfill jobs (Stooq + Binance public data)
- Incremental updater every 2 minutes (Binance `/fapi/v1/klines`)
- Validation + gap detection + repair attempts
- Query APIs:
  - `GET /api/assets?market=US|CRYPTO`
  - `GET /api/ohlcv?market=CRYPTO&symbol=BTCUSDT&tf=5m&start=...&end=...`
- Signal Contract persistence + audit trail tables (`signals`, `signal_events`, `executions`, `market_state`, `performance_snapshots`, `user_risk_profiles`)
- Opportunity interactions: eligibility check, paper execute, mark-as-done loop
- Standalone AI cockpit page (`/ai`) + streaming endpoint (`POST /api/ai-chat`)
- Provider abstraction: `AI_PROVIDER=groq|gemini|openai` (plus optional ollama fallback)
- Unit tests for parsing and upsert behavior
- Vercel serverless handlers (`/api/assets`, `/api/ohlcv`)

## Tech

- TypeScript (Node.js)
- SQLite (`better-sqlite3`) for MVP persistence
- Express for local REST service
- Streaming zip + CSV parsing (`unzipper`, `csv-parse`)
- Vercel/Next.js-compatible API handlers in `/api/*.ts`

## Schema

### `assets`

- `asset_id` (PK)
- `symbol`
- `market` (`US|CRYPTO`)
- `venue`
- `base`
- `quote`
- `status`

### `ohlcv`

- `asset_id` (FK)
- `timeframe`
- `ts_open` (UTC ms)
- `open`, `high`, `low`, `close`, `volume` (stored as text decimals)
- `source`
- `ingest_at`

Unique key: `(asset_id, timeframe, ts_open)` (via PK)

### Additional ops tables

- `ingest_cursors` (watermark per asset/timeframe)
- `ingest_anomalies` (validation findings)
- placeholder tables for future `funding_rates`, `basis_snapshots`
- `signals` (normalized SignalContract columns + payload JSON)
- `signal_events` (audit event stream per signal)
- `executions` (paper/live user execution records)
- `user_risk_profiles`
- `market_state` (temperature/regime snapshots)
- `performance_snapshots` (overall + by strategy + by regime + deviation)

## Setup

```bash
npm install
cp .env.example .env
npm run db:init
npm run db:migrate
```

For AI chat on free tier, `AI_PROVIDER=groq` + `GROQ_API_KEY` is enough (no credit card binding needed).

## Run Locally (UI + API)

Start mobile H5 UI:

```bash
npm run dev
```

Open:

- `http://localhost:5173` (Vite default)

Start local API service in another terminal:

```bash
npm run api:data
```

Open:

- `http://localhost:8787/healthz`

The app now supports multi-asset signals:

- `OPTIONS` (US intraday options)
- `US_STOCK` (US swing/trend)
- `CRYPTO` (spot/perp with funding/basis context)

## Config

Main config file: `config/ingestion.config.json`

- symbol lists
- timeframes
- Stooq pack codes
- Binance public/realtime endpoints
- retry/rate settings

Env overrides:

- `DB_PATH`
- `INGEST_CONFIG_PATH`
- `CRYPTO_SYMBOLS`
- `US_SYMBOLS`
- `PUBLIC_SIGNALS_API_KEY`
- `DISCORD_WEBHOOK_URL`

## Backfill Jobs

### US (Stooq bulk)

```bash
npm run backfill -- --market US --tf 1d
npm run backfill -- --market US --tf 1h
npm run backfill -- --market US --tf 5m
```

Equivalent direct CLI:

```bash
node scripts/backfill --market US --tf 1d
```

### Crypto (Binance public data)

```bash
npm run backfill -- --market CRYPTO --tf 5m,1h,1d
```

### All

```bash
npm run backfill -- --market ALL
```

Notes:

- Stooq bulk links are built from `stooq.bulkPackCodes` (`d_us_txt`, `h_us_txt`, `5_us_txt`).
- If Stooq returns `Unauthorized`, rerun later or use an allowed network/session.

## Incremental Updater (every 2 min)

Run once:

```bash
npm run update:binance
```

Equivalent direct CLI:

```bash
node scripts/update-binance --once
```

Run worker loop:

```bash
npm run worker:binance
```

The updater:

- reads cursor/watermark per symbol/timeframe
- pulls recent bars (`limit=200` by default)
- retries with exponential backoff
- upserts idempotently

## Validation Job

```bash
npm run validate:data -- --lookbackBars 2000 --tf 5m,1h,1d
```

Equivalent direct CLI:

```bash
node scripts/validate-data --lookbackBars 2000 --tf 5m,1h,1d
```

Behavior:

- detects missing bars by timeframe cadence
- logs anomalies to `ingest_anomalies`
- attempts repair from Binance REST for crypto assets

## Local Query API

Start API server:

```bash
npm run api:data
```

### Example calls

```bash
curl 'http://localhost:8787/api/assets?market=CRYPTO'

curl 'http://localhost:8787/api/ohlcv?market=CRYPTO&symbol=BTCUSDT&tf=5m&start=2026-03-01T00:00:00Z&end=2026-03-03T00:00:00Z'

curl 'http://localhost:8787/api/signals?market=CRYPTO&status=ALL&limit=20'

curl 'http://localhost:8787/api/signals/SIG-2026-0301-1001?userId=guest-001'

curl -X POST 'http://localhost:8787/api/executions' \
  -H 'Content-Type: application/json' \
  -d '{"userId":"guest-001","signalId":"SIG-2026-0301-1001","mode":"PAPER","action":"EXECUTE"}'

curl 'http://localhost:8787/api/market-state?market=CRYPTO&symbol=BTC-USDT'

curl 'http://localhost:8787/api/performance?market=US&range=ALL'

curl 'http://localhost:8787/api/market/modules?market=US&assetClass=OPTIONS'

curl -H 'x-api-key: nova-public-demo-key' \
  'http://localhost:8787/api/public/signals?assetClass=CRYPTO&status=ALL&limit=20'

curl 'http://localhost:8787/api/connect/broker?userId=guest-001&provider=ALPACA'

curl -X POST 'http://localhost:8787/api/connect/exchange' \
  -H 'Content-Type: application/json' \
  -d '{"userId":"guest-001","provider":"BINANCE","mode":"READ_ONLY"}'
```

Response order is ascending by `ts_open`.

## Conversational AI Assistant

### Endpoint

`POST /api/ai-chat` (legacy `/api/chat` kept for compatibility)

Request:

```json
{
  "userId": "u_demo_1",
  "message": "How do I execute this setup?",
  "context": {
    "signalId": "SIG-2026-0301-1001",
    "symbol": "BTCUSDT",
    "market": "CRYPTO",
    "timeframe": "5m"
  }
}
```

Response is streamed as NDJSON lines:

```json
{"type":"meta","mode":"context-aware","provider":"groq"}
{"type":"chunk","delta":"..."}
{"type":"done","mode":"context-aware","provider":"groq"}
```

### Provider behavior

- Default: Groq (`AI_PROVIDER=groq`) using `GROQ_API_KEY`
- Optional alternatives: Gemini (`AI_PROVIDER=gemini`, `GEMINI_API_KEY`), OpenAI (`AI_PROVIDER=openai`, `OPENAI_API_KEY`)
- Optional local fallback: Ollama (`OLLAMA_BASE_URL`)
- If context is requested but exact internal data is missing, assistant will explicitly say:
  - `I don’t have your exact signal data yet, so here’s a general guideline.`

### curl examples

General coach mode:

```bash
curl -N -X POST 'http://localhost:8787/api/ai-chat' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId":"u_001",
    "message":"What are common failure modes in breakout systems?"
  }'
```

Context-aware mode:

```bash
curl -N -X POST 'http://localhost:8787/api/ai-chat' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId":"u_001",
    "message":"How should I execute this?",
    "context":{"signalId":"SIG-2026-0301-1001","symbol":"BTCUSDT","market":"CRYPTO","timeframe":"5m"}
  }'
```

### Safety + audit

- No profit guarantees, no personalized financial advice
- Per-user rate limiting on server side
- Request/response metadata logged to `chat_audit_logs` for audit trail

## Vercel / Serverless

Included handlers:

- `api/assets.ts`
- `api/ohlcv.ts`
- `api/chat.ts`
- `api/ai-chat.ts`
- Next.js App Router equivalent: `app/api/chat/route.ts`
- Next.js App Router equivalent: `app/api/ai-chat/route.ts`

These use the same repository/query code paths.

For production serverless deployment, prefer external persistent DB (Postgres) instead of ephemeral filesystem SQLite.

## Tests

```bash
npm run test:data
```

Covers:

- parser correctness for Stooq/Binance records
- idempotent upsert and cursor updates

## UI

Run UI as before:

```bash
npm run dev
npm run build
```

Standalone AI cockpit route:

- `http://localhost:5173/ai`

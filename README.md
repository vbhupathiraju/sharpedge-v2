# SharpEdge — Real-Time Sports Betting Intelligence

A real-time data engineering portfolio project that detects divergence between Kalshi prediction market prices and traditional sportsbook odds to surface sharp money signals.

**Live Dashboard:** [sharpedge-v2.vercel.app](https://sharpedge-v2.vercel.app)

---

## Architecture
ESPN API ─────────────────────────────────────────────┐
The Odds API ──── EC2 Producers (Docker) ──── Kinesis Firehose ──── S3 (Parquet)
Kalshi API ───────────────────────────────────────────┘
│
AWS Lambda
(signal computation)
│
S3 (processed)
│
Amazon Athena
│
Next.js Dashboard
(Vercel, live)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Live odds | The Odds API (REST, polling) |
| Prediction markets | Kalshi API (REST, polling) |
| Game events | ESPN API (REST, free) |
| Ingestion | EC2 producers writing directly to Kinesis Firehose |
| Storage | Amazon S3 (raw JSON + processed Parquet, SNAPPY compressed) |
| Signal computation | AWS Lambda (Python, pandas, pyarrow) — event-driven on S3 file drop |
| Query layer | Amazon Athena (queries Parquet on S3 directly) |
| Partition automation | EventBridge (daily Athena partition registration) |
| Secrets | AWS Secrets Manager |
| Audit | AWS CloudTrail |
| Dashboard | Next.js deployed on Vercel |

---

## Signal Logic

### Divergence Signals
Compares Kalshi implied probability (prediction market consensus) against the average implied probability across major sportsbooks (DraftKings, FanDuel, BetMGM, BetRivers). A divergence ≥ 5 percentage points flags a potential market inefficiency.

### Sharp Money Signals
Tracks odds movement between poll cycles. A shift ≥ 10 American odds points on a single book flags potential sharp money activity — professional bettors moving the line.

---

## Repository Structure
sharpedge-v2/
├── producers/                  # EC2 Docker containers — poll APIs, write to Firehose
│   ├── kalshi_producer/        # Kalshi prediction market data
│   ├── odds_api_producer/      # Sportsbook odds via The Odds API
│   ├── game_events_producer/   # Live game scores via ESPN
│   ├── firehose_producer.py    # Shared Firehose boto3 client
│   ├── config_loader.py        # Hot-reloadable sports schedule config
│   ├── secrets_helper.py       # Secrets Manager helper
│   └── sports_config.json      # Per-sport config (schedules, thresholds, team abbreviations)
├── lambda/
│   ├── signal_processor/       # Reads raw S3 files, computes signals, writes Parquet
│   └── athena_repair/          # Daily Athena partition registration via EventBridge
├── nextjs-dashboard/           # Next.js + Vercel dashboard
│   ├── app/api/                # API routes querying Athena
│   └── lib/athena.ts           # AWS SDK v3 Athena client
├── infrastructure/             # Terraform (EC2, Firehose, VPC, security groups)
└── snowflake_views_backup.sql  # v1 reference only

---

## Infrastructure

- **EC2:** `t4g.small` (ARM/Graviton) — runs 3 Docker producer containers
- **Firehose:** 3 delivery streams (odds, kalshi, game-events) — 60s/1MB buffer to S3
- **Lambda:** `sports-betting-signal-processor` — triggers on every S3 file drop, runs in ~1.5s
- **Athena:** External tables over S3 Parquet — no warehouse, no cold start
- **Cost:** ~$54–60/month

---

## v1 (Archived)

The original pipeline used Apache Kafka (AWS MSK), Databricks Structured Streaming, and Snowflake. That version is preserved at [sports-betting-intelligence](https://github.com/vbhupathiraju/sports-betting-intelligence) as a reference implementation.

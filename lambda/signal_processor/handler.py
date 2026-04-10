import json
import boto3
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import io
import os
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)

S3_BUCKET = "sports-betting-raw-data-974482386805"
DIVERGENCE_THRESHOLD = 0.05   # 5 percentage points
SHARP_MONEY_THRESHOLD = 10    # 10 American odds points
LOOKBACK_MINUTES = 15         # how far back to scan for previous poll cycle

s3 = boto3.client("s3")


# ─── HELPER: American odds → implied probability ───────────────────────────────
def american_to_implied_prob(odds):
    if odds is None or pd.isna(odds):
        return None
    if odds < 0:
        return (-odds) / (-odds + 100)
    else:
        return 100 / (odds + 100)


# ─── HELPER: List recent S3 files under a prefix within lookback window ────────
def list_recent_s3_files(prefix, lookback_minutes=LOOKBACK_MINUTES):
    """Return S3 keys under prefix modified within the last lookback_minutes."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=lookback_minutes)
    paginator = s3.get_paginator("list_objects_v2")
    keys = []
    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
        for obj in page.get("Contents", []):
            if obj["LastModified"] >= cutoff:
                keys.append(obj["Key"])
    logger.info(f"Found {len(keys)} recent files under s3://{S3_BUCKET}/{prefix}")
    return keys


# ─── HELPER: Read JSON files from S3 into a single DataFrame ──────────────────
def read_json_files_from_s3(keys):
    """Read a list of S3 JSON keys into a single concatenated DataFrame."""
    frames = []
    for key in keys:
        try:
            response = s3.get_object(Bucket=S3_BUCKET, Key=key)
            content = response["Body"].read().decode("utf-8")
            # Firehose writes one JSON object per line (newline-delimited JSON)
            lines = [l.strip() for l in content.strip().splitlines() if l.strip()]
            records = [json.loads(l) for l in lines]
            if records:
                frames.append(pd.DataFrame(records))
        except Exception as e:
            logger.warning(f"Failed to read {key}: {e}")
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


# ─── HELPER: Write DataFrame to S3 as Parquet partitioned by date ─────────────
def write_parquet_to_s3(df, signal_type):
    """Write signals DataFrame to S3 as Parquet with year/month/day partitioning."""
    if df.empty:
        logger.info(f"No {signal_type} signals to write.")
        return

    now = datetime.now(timezone.utc)
    prefix = (
        f"processed/{signal_type}/"
        f"year={now.year}/month={now.month:02d}/day={now.day:02d}/"
        f"{signal_type}_{now.strftime('%Y%m%d_%H%M%S')}.parquet"
    )

    table = pa.Table.from_pandas(df, preserve_index=False)
    buf = io.BytesIO()
    pq.write_table(table, buf, compression="snappy")
    buf.seek(0)

    s3.put_object(Bucket=S3_BUCKET, Key=prefix, Body=buf.read())
    logger.info(f"Wrote {len(df)} {signal_type} rows to s3://{S3_BUCKET}/{prefix}")


# ─── COMPUTE: Divergence signals ──────────────────────────────────────────────
def compute_divergence_signals(odds_df, kalshi_df):
    """
    Compare Kalshi implied probability vs average sportsbook implied probability.
    Flag games where they diverge by more than DIVERGENCE_THRESHOLD.
    """
    if odds_df.empty or kalshi_df.empty:
        logger.info("Skipping divergence — missing odds or kalshi data.")
        return pd.DataFrame()

    # ── Explode odds bookmakers ──
    rows = []
    for _, row in odds_df.iterrows():
        bookmakers = row.get("bookmakers", [])
        if not isinstance(bookmakers, list):
            continue
        for bm in bookmakers:
            for market in bm.get("markets", []):
                if market.get("key") != "h2h":
                    continue
                for outcome in market.get("outcomes", []):
                    odds_val = outcome.get("price")
                    if odds_val is None:
                        continue
                    rows.append({
                        "sport_key":      row.get("sport_key"),
                        "home_team":      row.get("home_team"),
                        "away_team":      row.get("away_team"),
                        "commence_time":  row.get("commence_time"),
                        "bookmaker_key":  bm.get("key"),
                        "team":           outcome.get("name"),
                        "american_odds":  odds_val,
                        "implied_prob":   american_to_implied_prob(odds_val),
                        "ingested_at":    row.get("ingested_at"),
                    })

    if not rows:
        logger.info("No h2h odds rows after explode.")
        return pd.DataFrame()

    exploded = pd.DataFrame(rows)

    # ── Average implied prob across bookmakers per game per team ──
    avg_odds = (
        exploded
        .groupby(["sport_key", "home_team", "away_team", "commence_time", "team"])
        .agg(
            avg_implied_prob=("implied_prob", "mean"),
            num_bookmakers=("bookmaker_key", "nunique")
        )
        .reset_index()
    )

    # ── Keep only home team rows for joining ──
    home_odds = avg_odds[avg_odds["team"] == avg_odds["home_team"]].copy()
    home_odds = home_odds.rename(columns={"avg_implied_prob": "sportsbook_home_prob"})

    # ── Prepare Kalshi — filter active markets only ──
    kalshi_active = kalshi_df[kalshi_df.get("status", pd.Series()) == "active"].copy() \
        if "status" in kalshi_df.columns else kalshi_df.copy()

    if kalshi_active.empty:
        logger.info("No active Kalshi markets found.")
        return pd.DataFrame()

    # ── Compute Kalshi implied prob from yes_ask + yes_bid midpoint ──
    kalshi_active["yes_ask"] = pd.to_numeric(
        kalshi_active.get("yes_ask_dollars", None), errors="coerce"
    )
    kalshi_active["yes_bid"] = pd.to_numeric(
        kalshi_active.get("yes_bid_dollars", None), errors="coerce"
    )
    kalshi_active["kalshi_implied_prob"] = (
        kalshi_active["yes_ask"] + kalshi_active["yes_bid"]
    ) / 2
    kalshi_active = kalshi_active.dropna(subset=["kalshi_implied_prob"])
    kalshi_active = kalshi_active[kalshi_active["kalshi_implied_prob"] > 0]

    # ── Join Kalshi with sportsbook home odds on home_team + away_team ──
    merged = kalshi_active.merge(
        home_odds[["home_team", "away_team", "sport_key",
                   "commence_time", "sportsbook_home_prob", "num_bookmakers"]],
        on=["home_team", "away_team"],
        how="inner"
    )

    if merged.empty:
        logger.info("No games matched between Kalshi and sportsbook odds.")
        return pd.DataFrame()

    now = datetime.now(timezone.utc)
    merged["divergence"] = (
        merged["kalshi_implied_prob"] - merged["sportsbook_home_prob"]
    ).abs()
    merged["signal_direction"] = merged.apply(
        lambda r: "KALSHI_HIGHER"
        if r["kalshi_implied_prob"] > r["sportsbook_home_prob"]
        else "SPORTSBOOK_HIGHER",
        axis=1
    )
    merged["is_divergence_signal"] = merged["divergence"] >= DIVERGENCE_THRESHOLD
    merged["signal_type"] = "divergence"
    merged["computed_at"] = now

    result = merged[[
        "signal_type", "computed_at", "sport_key", "home_team", "away_team",
        "commence_time", "event_ticker", "market_ticker", "kalshi_implied_prob",
        "sportsbook_home_prob", "divergence", "signal_direction",
        "is_divergence_signal", "num_bookmakers"
    ]].copy()

    signals = result["is_divergence_signal"].sum()
    logger.info(f"Divergence: {len(result)} rows, {signals} signals")
    return result


# ─── COMPUTE: Sharp money signals ─────────────────────────────────────────────
def compute_sharp_money_signals(odds_df, prev_odds_df):
    """
    Compare current odds vs previous poll cycle odds.
    Flag games where a bookmaker's line moved by more than SHARP_MONEY_THRESHOLD.
    """
    if odds_df.empty or prev_odds_df.empty:
        logger.info("Skipping sharp money — missing current or previous odds.")
        return pd.DataFrame()

    MAJOR_BOOKS = {"fanduel", "draftkings", "betmgm", "betrivers"}

    def explode_odds(df, label):
        rows = []
        for _, row in df.iterrows():
            bookmakers = row.get("bookmakers", [])
            if not isinstance(bookmakers, list):
                continue
            for bm in bookmakers:
                if bm.get("key") not in MAJOR_BOOKS:
                    continue
                for market in bm.get("markets", []):
                    if market.get("key") != "h2h":
                        continue
                    for outcome in market.get("outcomes", []):
                        odds_val = outcome.get("price")
                        if odds_val is None:
                            continue
                        rows.append({
                            "sport_key":     row.get("sport_key"),
                            "home_team":     row.get("home_team"),
                            "away_team":     row.get("away_team"),
                            "commence_time": row.get("commence_time"),
                            "bookmaker_key": bm.get("key"),
                            "team":          outcome.get("name"),
                            "american_odds": odds_val,
                            "implied_prob":  american_to_implied_prob(odds_val),
                            "ingested_at":   row.get("ingested_at"),
                            "snapshot":      label,
                        })
        return pd.DataFrame(rows)

    current = explode_odds(odds_df, "current")
    previous = explode_odds(prev_odds_df, "previous")

    if current.empty or previous.empty:
        logger.info("No h2h rows after exploding current or previous odds.")
        return pd.DataFrame()

    # ── Join current vs previous on game + bookmaker + team ──
    joined = current.merge(
        previous[["home_team", "away_team", "bookmaker_key",
                  "team", "american_odds", "implied_prob"]],
        on=["home_team", "away_team", "bookmaker_key", "team"],
        suffixes=("", "_prev"),
        how="inner"
    )

    if joined.empty:
        logger.info("No matching rows between current and previous odds snapshots.")
        return pd.DataFrame()

    now = datetime.now(timezone.utc)
    joined["odds_movement"] = (
        joined["american_odds"] - joined["american_odds_prev"]
    ).abs()
    joined["prob_movement"] = (
        joined["implied_prob"] - joined["implied_prob_prev"]
    ).abs().round(4)
    joined["is_sharp_signal"] = joined["odds_movement"] >= SHARP_MONEY_THRESHOLD
    joined["movement_direction"] = joined.apply(
        lambda r: "ODDS_LENGTHENING"
        if r["american_odds"] > r["american_odds_prev"]
        else "ODDS_SHORTENING",
        axis=1
    )
    joined["signal_type"] = "sharp_money"
    joined["computed_at"] = now
    joined["ingested_at_ts"] = pd.to_datetime(joined["ingested_at"], utc=True)

    result = joined[[
        "signal_type", "computed_at", "sport_key", "home_team", "away_team",
        "commence_time", "bookmaker_key", "team",
        "american_odds_prev", "american_odds", "odds_movement",
        "implied_prob_prev", "implied_prob", "prob_movement",
        "movement_direction", "is_sharp_signal", "ingested_at_ts"
    ]].copy()

    result = result.rename(columns={
        "american_odds_prev": "prev_odds",
        "american_odds":      "american_odds",
        "implied_prob_prev":  "prev_implied_prob",
        "implied_prob":       "current_implied_prob",
    })

    signals = result["is_sharp_signal"].sum()
    logger.info(f"Sharp money: {len(result)} rows, {signals} signals")
    return result


# ─── MAIN LAMBDA HANDLER ──────────────────────────────────────────────────────
def handler(event, context):
    logger.info(f"Event: {json.dumps(event)}")

    # ── Determine which prefix triggered this Lambda ──
    record = event["Records"][0]
    triggered_key = record["s3"]["object"]["key"]
    logger.info(f"Triggered by: s3://{S3_BUCKET}/{triggered_key}")

    # ── Load recent raw data from all three sources ──
    now = datetime.now(timezone.utc)
    today = now.strftime("year=%Y/month=%m/day=%d")

    odds_keys        = list_recent_s3_files(f"odds/{today}/")
    kalshi_keys      = list_recent_s3_files(f"kalshi/{today}/")
    game_event_keys  = list_recent_s3_files(f"game-events/{today}/")

    # For sharp money: need a "previous" snapshot — look back further
    prev_odds_keys   = list_recent_s3_files(f"odds/{today}/", lookback_minutes=30)
    # Exclude the most recent files (those are "current")
    prev_odds_keys   = [k for k in prev_odds_keys if k not in odds_keys]

    odds_df          = read_json_files_from_s3(odds_keys)
    kalshi_df        = read_json_files_from_s3(kalshi_keys)
    prev_odds_df     = read_json_files_from_s3(prev_odds_keys)

    logger.info(
        f"Loaded: {len(odds_df)} odds rows, "
        f"{len(kalshi_df)} kalshi rows, "
        f"{len(prev_odds_df)} prev odds rows"
    )

    # ── Compute signals ──
    divergence_df   = compute_divergence_signals(odds_df, kalshi_df)
    sharp_money_df  = compute_sharp_money_signals(odds_df, prev_odds_df)

    # ── Write results to S3 as Parquet ──
    write_parquet_to_s3(divergence_df, "divergence_signals")
    write_parquet_to_s3(sharp_money_df, "sharp_money_signals")

    return {
        "statusCode": 200,
        "body": json.dumps({
            "divergence_rows":   len(divergence_df),
            "sharp_money_rows":  len(sharp_money_df),
            "triggered_by":      triggered_key,
        })
    }

"""
Kalshi Producer
---------------
Polls ESPN for today's games, fetches all active Kalshi markets for each
sport's series, matches by team abbreviations, and publishes directly
to the Kinesis Firehose kalshi stream.

No Kafka dependency. ESPN is called directly each poll cycle.
Config is hot-reloaded each cycle — adding a new sport requires no code changes.
"""

import logging
import sys
import time
from datetime import datetime, timezone

import requests

sys.path.insert(0, "/app")
from config_loader import (
    get_active_sports,
    get_poll_interval,
    is_within_schedule,
    load_config,
    seconds_until_next_window,
)
from firehose_producer import put_record
from secrets_helper import get_kalshi_credentials

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("kalshi_producer")

KALSHI_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2"
ESPN_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports"


def fetch_today_games(sport_key: str, sport_cfg: dict) -> list:
    """Fetch today's games from ESPN for a given sport."""
    league_path = sport_cfg.get("espn_league_path")
    if not league_path:
        return []
    url = f"{ESPN_BASE_URL}/{league_path}"
    params = sport_cfg.get("espn_params", {})
    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        events = resp.json().get("events", [])
        games = []
        for event in events:
            competition = event.get("competitions", [{}])[0]
            competitors = competition.get("competitors", [])
            home = next((c for c in competitors if c.get("order") == 0), None)
            away = next((c for c in competitors if c.get("order") == 1), None)
            if not home or not away:
                continue
            commence_time = event.get("date", "")
            game_date = commence_time[:10] if commence_time else ""
            games.append({
                "sport_key": sport_key,
                "home_team": home.get("team", {}).get("displayName", ""),
                "away_team": away.get("team", {}).get("displayName", ""),
                "game_date": game_date,
                "commence_time": commence_time,
            })
        logger.info("Fetched %d games from ESPN for %s", len(games), sport_key)
        return games
    except Exception as e:
        logger.error("Error fetching ESPN games for %s: %s", sport_key, e)
        return []


def fetch_kalshi_markets_for_series(series_ticker: str, kalshi_api_key: str) -> list:
    """Fetch all active Kalshi markets for a series (e.g. KXMLBGAME)."""
    url = f"{KALSHI_BASE_URL}/markets"
    headers = {"Authorization": f"Bearer {kalshi_api_key}"}
    all_markets = []
    cursor = None
    today = datetime.now(timezone.utc).strftime("%y%b%d").upper()

    try:
        for _ in range(5):  # max 5 pages
            params = {"limit": 100, "series_ticker": series_ticker, "status": "open"}
            if cursor:
                params["cursor"] = cursor
            resp = requests.get(url, headers=headers, params=params, timeout=15)
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()
            markets = data.get("markets", [])
            # Filter to today's markets only
            today_markets = [m for m in markets if today in m.get("ticker", "")]
            all_markets.extend(today_markets)
            cursor = data.get("cursor")
            if not cursor or not markets:
                break
        logger.info("Fetched %d active markets for %s (today)", len(all_markets), series_ticker)
        return all_markets
    except Exception as e:
        logger.error("Error fetching Kalshi markets for %s: %s", series_ticker, e)
        return []


def match_game_to_markets(game: dict, markets: list, team_abbr: dict) -> list:
    """
    Match a game's home+away teams to Kalshi markets by checking
    if both team abbreviations appear in the market ticker.
    """
    home_abbr = team_abbr.get(game["home_team"])
    away_abbr = team_abbr.get(game["away_team"])
    if not home_abbr or not away_abbr:
        if not home_abbr:
            logger.warning("No Kalshi abbr for home team '%s' (%s)", game["home_team"], game["sport_key"])
        if not away_abbr:
            logger.warning("No Kalshi abbr for away team '%s' (%s)", game["away_team"], game["sport_key"])
        return []

    matched = []
    for market in markets:
        ticker = market.get("ticker", "")
        # Event ticker is the part before the last hyphen
        event_ticker = "-".join(ticker.split("-")[:-1])
        if home_abbr in event_ticker and away_abbr in event_ticker:
            matched.append(market)
    return matched


def main():
    logger.info("Starting Kalshi producer (ESPN → Kalshi API → Firehose)")
    kalshi_creds = get_kalshi_credentials()
    kalshi_api_key = kalshi_creds["api_key"]

    try:
        while True:
            config = load_config()
            active_sports = get_active_sports(config)
            in_window = [s for s in active_sports if is_within_schedule(config["sports"][s])]
            out_of_window = [s for s in active_sports if not is_within_schedule(config["sports"][s])]

            if out_of_window:
                logger.info("Sports outside schedule window (skipping): %s", out_of_window)

            if not in_window:
                sleep_secs = min(seconds_until_next_window(config["sports"][s]) for s in active_sports)
                sleep_secs = min(sleep_secs, 300)
                logger.info("No active sports in window. Sleeping %ds...", sleep_secs)
                time.sleep(sleep_secs)
                continue

            total_sent = 0
            for sport_key in in_window:
                sport_cfg = config["sports"][sport_key]
                kalshi_prefix = sport_cfg.get("kalshi_prefix")
                if not kalshi_prefix:
                    continue

                # Fetch all today's Kalshi markets for this sport in one call
                all_markets = fetch_kalshi_markets_for_series(kalshi_prefix, kalshi_api_key)
                if not all_markets:
                    logger.info("No active Kalshi markets found for %s today", sport_key)
                    continue

                # Fetch today's games from ESPN
                games = fetch_today_games(sport_key, sport_cfg)
                team_abbr = sport_cfg.get("team_abbr", {})

                for game in games:
                    matched_markets = match_game_to_markets(game, all_markets, team_abbr)
                    for market in matched_markets:
                        ticker = market.get("ticker", "")
                        event_ticker = "-".join(ticker.split("-")[:-1])
                        record = {
                            "sport": sport_key,
                            "event_ticker": event_ticker,
                            "away_team": game["away_team"],
                            "home_team": game["home_team"],
                            "game_date": game["game_date"],
                            "market_ticker": ticker,
                            "title": market.get("title"),
                            "yes_ask_dollars": market.get("yes_ask_dollars"),
                            "yes_bid_dollars": market.get("yes_bid_dollars"),
                            "no_ask_dollars": market.get("no_ask_dollars"),
                            "no_bid_dollars": market.get("no_bid_dollars"),
                            "status": market.get("status"),
                            "volume": market.get("volume"),
                            "open_interest": market.get("open_interest"),
                        }
                        put_record("kalshi", record)
                        total_sent += 1
                    time.sleep(0.1)

            sleep_secs = min(get_poll_interval(config["sports"][s]) for s in in_window)
            logger.info("Sent %d Kalshi market records to Firehose. Sleeping %ds...", total_sent, sleep_secs)
            time.sleep(sleep_secs)

    except KeyboardInterrupt:
        logger.info("Shutting down Kalshi producer")


if __name__ == "__main__":
    main()

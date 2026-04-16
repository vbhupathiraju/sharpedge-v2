"""
Kalshi Producer
---------------
Polls ESPN for today's games, then fetches Kalshi winner markets for
each game and publishes directly to the Kinesis Firehose kalshi stream.

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
            })
        logger.info("Fetched %d games from ESPN for %s", len(games), sport_key)
        return games
    except Exception as e:
        logger.error("Error fetching ESPN games for %s: %s", sport_key, e)
        return []


def build_kalshi_event_ticker(sport_key, away_team, home_team, game_date, config):
    sport_cfg = config["sports"].get(sport_key)
    if not sport_cfg:
        return None
    prefix = sport_cfg.get("kalshi_prefix")
    if not prefix:
        return None
    team_abbr = sport_cfg.get("team_abbr", {})
    try:
        dt = datetime.strptime(game_date, "%Y-%m-%d")
    except ValueError:
        logger.warning("Invalid game_date format: %s", game_date)
        return None
    date_str = dt.strftime("%y%b%d").upper()
    away_abbr = team_abbr.get(away_team)
    home_abbr = team_abbr.get(home_team)
    if not away_abbr:
        logger.warning("No Kalshi abbr for away team '%s' (%s)", away_team, sport_key)
        return None
    if not home_abbr:
        logger.warning("No Kalshi abbr for home team '%s' (%s)", home_team, sport_key)
        return None
    return f"{prefix}-{date_str}{away_abbr}{home_abbr}"


def fetch_kalshi_markets(event_ticker: str, kalshi_api_key: str) -> list:
    url = f"{KALSHI_BASE_URL}/markets"
    headers = {"Authorization": f"Bearer {kalshi_api_key}"}
    params = {"limit": 10, "event_ticker": event_ticker}
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if resp.status_code == 404:
            logger.debug("No Kalshi market found for event: %s", event_ticker)
            return []
        resp.raise_for_status()
        return resp.json().get("markets", [])
    except Exception as e:
        logger.error("Error fetching Kalshi markets for %s: %s", event_ticker, e)
        return []


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
                games = fetch_today_games(sport_key, sport_cfg)

                for game in games:
                    event_ticker = build_kalshi_event_ticker(
                        sport_key,
                        game["away_team"],
                        game["home_team"],
                        game["game_date"],
                        config,
                    )
                    if not event_ticker:
                        continue
                    markets = fetch_kalshi_markets(event_ticker, kalshi_api_key)
                    for market in markets:
                        record = {
                            "sport": sport_key,
                            "event_ticker": event_ticker,
                            "away_team": game["away_team"],
                            "home_team": game["home_team"],
                            "game_date": game["game_date"],
                            "market_ticker": market.get("ticker"),
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
                    time.sleep(0.2)

            sleep_secs = min(get_poll_interval(config["sports"][s]) for s in in_window)
            logger.info("Sent %d Kalshi market records to Firehose. Sleeping %ds...", total_sent, sleep_secs)
            time.sleep(sleep_secs)

    except KeyboardInterrupt:
        logger.info("Shutting down Kalshi producer")


if __name__ == "__main__":
    main()

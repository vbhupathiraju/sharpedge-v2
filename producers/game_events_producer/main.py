"""
Game Events Producer
--------------------
Polls ESPN's public API for live game scores/events and publishes
directly to the Kinesis Firehose game-events stream.

No API key required. Zero Odds API quota consumed.

Sports, ESPN endpoints, schedules, and poll intervals are driven by
sports_config.json. Edit that file to add/remove sports or adjust
schedules — no code change needed.
Config is hot-reloaded each poll cycle so changes take effect immediately.
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("game_events_producer")

ESPN_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports"


def fetch_espn_scoreboard(sport_key: str, sport_cfg: dict) -> list:
    league_path = sport_cfg.get("espn_league_path")
    if not league_path:
        logger.warning("No espn_league_path configured for %s", sport_key)
        return []
    url = f"{ESPN_BASE_URL}/{league_path}"
    params = sport_cfg.get("espn_params", {})
    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        events = resp.json().get("events", [])
        logger.info("Fetched %d ESPN events for %s", len(events), sport_key)
        return events
    except requests.exceptions.HTTPError as e:
        logger.error("HTTP error fetching ESPN scoreboard for %s: %s", sport_key, e)
        return []
    except Exception as e:
        logger.error("Error fetching ESPN scoreboard for %s: %s", sport_key, e)
        return []


def parse_espn_event(event: dict, sport_key: str) -> dict | None:
    try:
        competition = event.get("competitions", [{}])[0]
        competitors = competition.get("competitors", [])
        home = next((c for c in competitors if c.get("order") == 0), None)
        away = next((c for c in competitors if c.get("order") == 1), None)
        if not home or not away:
            logger.warning("Could not find home/away for event %s", event.get("id"))
            return None
        status = event.get("status", {})
        status_type = status.get("type", {})
        state = status_type.get("state", "pre")
        home_score = home.get("score", "0")
        away_score = away.get("score", "0")
        scores = None
        if state in ("in", "post"):
            scores = [
                {"name": home.get("team", {}).get("displayName", ""), "score": home_score},
                {"name": away.get("team", {}).get("displayName", ""), "score": away_score},
            ]
        return {
            "sport": sport_key,
            "game_id": event.get("id"),
            "sport_key": sport_key,
            "sport_title": competition.get("type", {}).get("abbreviation", sport_key),
            "commence_time": event.get("date"),
            "completed": status_type.get("completed", False),
            "status_state": state,
            "status_description": status_type.get("description", ""),
            "home_team": home.get("team", {}).get("displayName", ""),
            "away_team": away.get("team", {}).get("displayName", ""),
            "home_score": home_score,
            "away_score": away_score,
            "scores": scores,
            "last_update": status_type.get("shortDetail", ""),
            "source": "espn",
        }
    except Exception as e:
        logger.error("Error parsing ESPN event %s: %s", event.get("id", "unknown"), e)
        return None


def main():
    logger.info("Starting Game Events producer (ESPN → Firehose)")
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
                events = fetch_espn_scoreboard(sport_key, sport_cfg)
                for event in events:
                    record = parse_espn_event(event, sport_key)
                    if record is None:
                        continue
                    put_record("game_events", record)
                    total_sent += 1

            sleep_secs = min(get_poll_interval(config["sports"][s]) for s in in_window)
            logger.info("Sent %d game event records to Firehose. Sleeping %ds...", total_sent, sleep_secs)
            time.sleep(sleep_secs)

    except KeyboardInterrupt:
        logger.info("Shutting down Game Events producer")


if __name__ == "__main__":
    main()

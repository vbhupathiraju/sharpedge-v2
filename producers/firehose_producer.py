"""
Firehose producer — replaces msk_producer.py.
All sport-specific producers use put_record() to write directly to Firehose.
"""

import json
import logging
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

AWS_REGION = "us-east-1"

_client = None

def _get_client():
    global _client
    if _client is None:
        _client = boto3.client("firehose", region_name=AWS_REGION)
    return _client

STREAM_MAP = {
    "odds":        "sports-betting-odds-stream",
    "kalshi":      "sports-betting-kalshi-stream",
    "game_events": "sports-betting-game-events-stream",
}

def put_record(stream_key: str, record: dict) -> None:
    """
    Serialize record to newline-terminated JSON and send to Firehose.
    stream_key must be one of: 'odds', 'kalshi', 'game_events'
    """
    record["ingested_at"] = datetime.now(timezone.utc).isoformat()
    stream_name = STREAM_MAP[stream_key]
    payload = (json.dumps(record) + "\n").encode("utf-8")
    try:
        _get_client().put_record(
            DeliveryStreamName=stream_name,
            Record={"Data": payload},
        )
        logger.debug("Sent record to %s", stream_name)
    except ClientError as e:
        logger.error("Firehose put_record failed for %s: %s", stream_name, e)
        raise

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY secrets_helper.py .
COPY firehose_producer.py .
COPY config_loader.py .
COPY sports_config.json .
COPY game_events_producer/main.py ./game_events_producer/main.py

CMD ["python", "game_events_producer/main.py"]

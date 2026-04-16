FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY secrets_helper.py .
COPY firehose_producer.py .
COPY config_loader.py .
COPY sports_config.json .
COPY kalshi_producer/main.py ./kalshi_producer/main.py

CMD ["python", "kalshi_producer/main.py"]

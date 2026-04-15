import boto3
import time
from datetime import datetime, timezone, timedelta

def run_query(athena, sql):
    response = athena.start_query_execution(
        QueryString=sql,
        WorkGroup='primary',
        QueryExecutionContext={'Database': 'sports_betting'},
        ResultConfiguration={
            'OutputLocation': 's3://sports-betting-athena-results-974482386805/'
        }
    )
    query_id = response['QueryExecutionId']
    for _ in range(30):
        time.sleep(2)
        status = athena.get_query_execution(QueryExecutionId=query_id)
        state = status['QueryExecution']['Status']['State']
        if state == 'SUCCEEDED':
            print(f"Succeeded: {sql[:60]}")
            return
        elif state in ('FAILED', 'CANCELLED'):
            reason = status['QueryExecution']['Status']['StateChangeReason']
            raise Exception(f"Query {state}: {reason}")
    raise Exception("Query timed out")

def handler(event, context):
    athena = boto3.client('athena', region_name='us-east-1')
    
    # Add partitions for today and tomorrow to stay ahead
    now = datetime.now(timezone.utc)
    dates = [now, now + timedelta(days=1)]
    
    tables = [
        ('divergence_signals', 's3://sports-betting-raw-data-974482386805/processed/divergence_signals'),
        ('sharp_money_signals', 's3://sports-betting-raw-data-974482386805/processed/sharp_money_signals'),
    ]
    
    for dt in dates:
        year = dt.strftime('%Y')
        month = dt.strftime('%m')
        day = dt.strftime('%d')
        
        for table, location in tables:
            sql = f"""
                ALTER TABLE sports_betting.{table}
                ADD IF NOT EXISTS PARTITION (year='{year}', month='{month}', day='{day}')
                LOCATION '{location}/year={year}/month={month}/day={day}/'
            """
            try:
                run_query(athena, sql)
                print(f"Partition added: {table} {year}-{month}-{day}")
            except Exception as e:
                print(f"Warning: {table} {year}-{month}-{day}: {e}")
    
    return {'statusCode': 200, 'body': 'Partitions registered'}

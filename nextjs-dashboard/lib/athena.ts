import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
} from "@aws-sdk/client-athena";

const client = new AthenaClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const WORKGROUP = "primary";
const DATABASE = "sports_betting";
const S3_OUTPUT = "s3://sports-betting-athena-results-974482386805/";

// Poll interval and max attempts for query completion
const POLL_INTERVAL_MS = 500;
const MAX_ATTEMPTS = 60; // 30 seconds max

export async function runAthenaQuery(sql: string): Promise<Record<string, string>[]> {
  // Start query
  const startCmd = new StartQueryExecutionCommand({
    QueryString: sql,
    WorkGroup: WORKGROUP,
    QueryExecutionContext: { Database: DATABASE },
    ResultConfiguration: { OutputLocation: S3_OUTPUT },
  });

  const { QueryExecutionId } = await client.send(startCmd);
  if (!QueryExecutionId) throw new Error("No QueryExecutionId returned");

  // Poll until complete
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const statusCmd = new GetQueryExecutionCommand({ QueryExecutionId });
    const { QueryExecution } = await client.send(statusCmd);
    const state = QueryExecution?.Status?.State;

    if (state === "SUCCEEDED") break;
    if (state === "FAILED" || state === "CANCELLED") {
      const reason = QueryExecution?.Status?.StateChangeReason;
      throw new Error(`Athena query ${state}: ${reason}`);
    }
  }

  // Fetch results
  const resultsCmd = new GetQueryResultsCommand({ QueryExecutionId });
  const { ResultSet } = await client.send(resultsCmd);

  const rows = ResultSet?.Rows ?? [];
  if (rows.length < 2) return []; // only header row = no data

  // First row is column headers
  const headers = rows[0].Data?.map((d) => d.VarCharValue ?? "") ?? [];

  // Convert remaining rows to objects
  return rows.slice(1).map((row) => {
    const values = row.Data?.map((d) => d.VarCharValue ?? "") ?? [];
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

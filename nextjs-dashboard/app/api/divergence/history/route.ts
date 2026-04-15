import { NextRequest, NextResponse } from "next/server";
import { runAthenaQuery } from "@/lib/athena";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const home_team = searchParams.get("home_team");
  const away_team = searchParams.get("away_team");
  const commence_time = searchParams.get("commence_time");

  if (!home_team || !away_team || !commence_time) {
    return NextResponse.json(
      { error: "home_team, away_team, and commence_time required" },
      { status: 400 }
    );
  }

  // Extract partition date from commence_time
  const date = new Date(commence_time);
  const year = date.getUTCFullYear().toString();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  try {
    const sql = `
      SELECT market_ticker, computed_at, kalshi_implied_prob,
             sportsbook_home_prob, divergence
      FROM sports_betting.divergence_signals
      WHERE year='${year}' AND month='${month}' AND day='${day}'
        AND home_team='${home_team.replace(/'/g, "''")}'
        AND away_team='${away_team.replace(/'/g, "''")}'
      ORDER BY computed_at ASC
      LIMIT 1000
    `;

    const rows = await runAthenaQuery(sql);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Athena divergence history error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}

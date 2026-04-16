import { NextRequest, NextResponse } from "next/server";
import { runAthenaQuery } from "@/lib/athena";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date) {
    return NextResponse.json({ error: "date parameter required" }, { status: 400 });
  }

  const [year, month, day] = date.split("-");

  try {
    const sql = `
      SELECT
        signal_type, MAX(computed_at) as computed_at, sport_key,
        home_team, away_team, commence_time, event_ticker, market_ticker,
        AVG(kalshi_implied_prob) as kalshi_implied_prob,
        AVG(sportsbook_home_prob) as sportsbook_home_prob,
        AVG(divergence) as divergence,
        MAX(signal_direction) as signal_direction,
        BOOL_OR(is_divergence_signal) as is_divergence_signal,
        MAX(num_bookmakers) as num_bookmakers
      FROM sports_betting.divergence_signals
      WHERE year='${year}' AND month='${month}' AND day='${day}'
        AND sport_key NOT IN ('basketball_wncaab', 'basketball_ncaaw')
        AND CAST(date_trunc('day', at_timezone(from_iso8601_timestamp(commence_time), 'America/New_York')) AS DATE) = DATE '${year}-${month}-${day}'
      GROUP BY signal_type, sport_key, home_team, away_team,
               commence_time, event_ticker, market_ticker
      ORDER BY divergence DESC
      LIMIT 1000
    `;

    const rows = await runAthenaQuery(sql);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Athena divergence query error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}

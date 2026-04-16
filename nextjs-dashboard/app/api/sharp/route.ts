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
        home_team, away_team, commence_time, bookmaker_key, team,
        MAX(prev_odds) as prev_odds,
        MAX(american_odds) as american_odds,
        MAX(odds_movement) as odds_movement,
        AVG(prev_implied_prob) as prev_implied_prob,
        AVG(current_implied_prob) as current_implied_prob,
        AVG(prob_movement) as prob_movement,
        MAX(movement_direction) as movement_direction,
        BOOL_OR(is_sharp_signal) as is_sharp_signal
      FROM sports_betting.sharp_money_signals
      WHERE year='${year}' AND month='${month}' AND day='${day}'
        AND sport_key NOT IN ('basketball_wncaab', 'basketball_ncaaw')
        AND CAST(date_trunc('day', at_timezone(from_iso8601_timestamp(commence_time), 'America/New_York')) AS DATE) = DATE '${year}-${month}-${day}'
      GROUP BY signal_type, sport_key, home_team, away_team,
               commence_time, bookmaker_key, team
      ORDER BY odds_movement DESC
      LIMIT 1000
    `;

    const rows = await runAthenaQuery(sql);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Athena sharp query error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}

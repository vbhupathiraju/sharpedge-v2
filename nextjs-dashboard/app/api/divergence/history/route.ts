import { NextRequest, NextResponse } from "next/server";
import { runAthenaQuery } from "@/lib/athena";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const fmt = (d: Date) => ({
    year: d.getUTCFullYear().toString(),
    month: String(d.getUTCMonth() + 1).padStart(2, "0"),
    day: String(d.getUTCDate()).padStart(2, "0"),
  });
  const td = fmt(now);
  const yd = fmt(yesterday);

  try {
    // Two tickers per game (one per team). Pick the one closest to sportsbook_home_prob
    // per timestamp — that's the home team's "Yes" market.
    const sql = `
      WITH ranked AS (
        SELECT computed_at,
               kalshi_implied_prob,
               sportsbook_home_prob,
               divergence,
               ROW_NUMBER() OVER (
                 PARTITION BY computed_at
                 ORDER BY ABS(kalshi_implied_prob - sportsbook_home_prob) ASC
               ) AS rn
        FROM sports_betting.divergence_signals
        WHERE (
          (year='${td.year}' AND month='${td.month}' AND day='${td.day}')
          OR (year='${yd.year}' AND month='${yd.month}' AND day='${yd.day}')
        )
          AND home_team='${home_team.replace(/'/g, "''")}'
          AND away_team='${away_team.replace(/'/g, "''")}'
      )
      SELECT computed_at, kalshi_implied_prob, sportsbook_home_prob, divergence
      FROM ranked
      WHERE rn = 1
      ORDER BY computed_at ASC
      LIMIT 50000
    `;

    const rows = await runAthenaQuery(sql);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Athena divergence history error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}

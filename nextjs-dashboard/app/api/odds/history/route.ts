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

  // Query today and yesterday to handle midnight UTC partition splits
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
    const sql = `
      SELECT team, bookmaker_key, computed_at,
             AVG(american_odds) as american_odds,
             AVG(prev_implied_prob) as prev_implied_prob,
             AVG(current_implied_prob) as current_implied_prob
      FROM sports_betting.sharp_money_signals
      WHERE (
        (year='${td.year}' AND month='${td.month}' AND day='${td.day}')
        OR (year='${yd.year}' AND month='${yd.month}' AND day='${yd.day}')
      )
        AND home_team='${home_team.replace(/'/g, "''")}'
        AND away_team='${away_team.replace(/'/g, "''")}'
      GROUP BY team, bookmaker_key, computed_at
      ORDER BY computed_at ASC
      LIMIT 50000
    `;

    const rows = await runAthenaQuery(sql);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Athena odds history error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}

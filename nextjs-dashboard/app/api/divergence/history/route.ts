import { NextRequest, NextResponse } from "next/server";
import { runAthenaQuery } from "@/lib/athena";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Kalshi team abbreviations by sport — must match sports_config.json
const KALSHI_ABBR: Record<string, Record<string, string>> = {
  basketball_nba: {
    "Atlanta Hawks":"ATL","Boston Celtics":"BOS","Brooklyn Nets":"BKN",
    "Charlotte Hornets":"CHA","Chicago Bulls":"CHI","Cleveland Cavaliers":"CLE",
    "Dallas Mavericks":"DAL","Denver Nuggets":"DEN","Detroit Pistons":"DET",
    "Golden State Warriors":"GSW","Houston Rockets":"HOU","Indiana Pacers":"IND",
    "LA Clippers":"LAC","Los Angeles Clippers":"LAC","Los Angeles Lakers":"LAL",
    "Memphis Grizzlies":"MEM","Miami Heat":"MIA","Milwaukee Bucks":"MIL",
    "Minnesota Timberwolves":"MIN","New Orleans Pelicans":"NOP","New York Knicks":"NYK",
    "Oklahoma City Thunder":"OKC","Orlando Magic":"ORL","Philadelphia 76ers":"PHI",
    "Phoenix Suns":"PHX","Portland Trail Blazers":"POR","Sacramento Kings":"SAC",
    "San Antonio Spurs":"SAS","Toronto Raptors":"TOR","Utah Jazz":"UTA",
    "Washington Wizards":"WAS",
  },
  baseball_mlb: {
    "Arizona Diamondbacks":"ARI","Atlanta Braves":"ATL","Baltimore Orioles":"BAL",
    "Boston Red Sox":"BOS","Chicago Cubs":"CHC","Chicago White Sox":"CWS",
    "Cincinnati Reds":"CIN","Cleveland Guardians":"CLE","Colorado Rockies":"COL",
    "Detroit Tigers":"DET","Houston Astros":"HOU","Kansas City Royals":"KC",
    "Los Angeles Angels":"LAA","Los Angeles Dodgers":"LAD","Miami Marlins":"MIA",
    "Milwaukee Brewers":"MIL","Minnesota Twins":"MIN","New York Mets":"NYM",
    "New York Yankees":"NYY","Oakland Athletics":"ATH","Philadelphia Phillies":"PHI",
    "Pittsburgh Pirates":"PIT","San Diego Padres":"SD","San Francisco Giants":"SF",
    "Seattle Mariners":"SEA","St. Louis Cardinals":"STL","Tampa Bay Rays":"TB",
    "Texas Rangers":"TEX","Toronto Blue Jays":"TOR","Washington Nationals":"WSH",
    "Athletics":"ATH",
  },
  icehockey_nhl: {
    "Anaheim Ducks":"ANA","Boston Bruins":"BOS","Buffalo Sabres":"BUF",
    "Calgary Flames":"CGY","Carolina Hurricanes":"CAR","Chicago Blackhawks":"CHI",
    "Colorado Avalanche":"COL","Columbus Blue Jackets":"CBJ","Dallas Stars":"DAL",
    "Detroit Red Wings":"DET","Edmonton Oilers":"EDM","Florida Panthers":"FLA",
    "Los Angeles Kings":"LA","Minnesota Wild":"MIN","Montreal Canadiens":"MTL",
    "Nashville Predators":"NSH","New Jersey Devils":"NJ","New York Islanders":"NYI",
    "New York Rangers":"NYR","Ottawa Senators":"OTT","Philadelphia Flyers":"PHI",
    "Pittsburgh Penguins":"PIT","San Jose Sharks":"SJ","Seattle Kraken":"SEA",
    "St. Louis Blues":"STL","Tampa Bay Lightning":"TB","Toronto Maple Leafs":"TOR",
    "Utah Hockey Club":"UTA","Vancouver Canucks":"VAN","Vegas Golden Knights":"VGK",
    "Washington Capitals":"WSH","Winnipeg Jets":"WPG","Utah Mammoth":"UTA",
  },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const home_team = searchParams.get("home_team");
  const away_team = searchParams.get("away_team");
  const commence_time = searchParams.get("commence_time");
  const sport_key = searchParams.get("sport_key") ?? "";

  if (!home_team || !away_team || !commence_time) {
    return NextResponse.json(
      { error: "home_team, away_team, and commence_time required" },
      { status: 400 }
    );
  }

  const homeAbbr = KALSHI_ABBR[sport_key]?.[home_team];

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

  // If we have the home team abbreviation, filter directly to the home ticker.
  // Otherwise fall back to one row per timestamp using MIN(kalshi_implied_prob > 0.5).
  const tickerFilter = homeAbbr
    ? `AND market_ticker LIKE '%-${homeAbbr}'`
    : `AND kalshi_implied_prob >= 0.5`;

  try {
    const sql = `
      SELECT computed_at,
             kalshi_implied_prob,
             sportsbook_home_prob,
             divergence
      FROM sports_betting.divergence_signals
      WHERE (
        (year='${td.year}' AND month='${td.month}' AND day='${td.day}')
        OR (year='${yd.year}' AND month='${yd.month}' AND day='${yd.day}')
      )
        AND home_team='${home_team.replace(/'/g, "''")}'
        AND away_team='${away_team.replace(/'/g, "''")}'
        ${tickerFilter}
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

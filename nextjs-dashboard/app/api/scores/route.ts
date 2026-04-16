import { NextRequest, NextResponse } from 'next/server';

const ESPN_PATHS: Record<string, string> = {
  basketball_nba: 'basketball/nba',
  basketball_ncaab: 'basketball/mens-college-basketball',
  baseball_mlb: 'baseball/mlb',
  icehockey_nhl: 'hockey/nhl',
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get('sport');
  if (!sport) return NextResponse.json({});

  const path = ESPN_PATHS[sport];
  if (!path) return NextResponse.json({});

  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`, { next: { revalidate: 30 } });
    const data = await res.json();
    const scores: Record<string, any> = {};

    for (const event of data.events || []) {
      for (const comp of event.competitions || []) {
        const competitors = comp.competitors || [];
        const home = competitors.find((c: any) => c.homeAway === 'home');
        const away = competitors.find((c: any) => c.homeAway === 'away');
        if (!home || !away) continue;

        const homeName = home.team.displayName;
        const awayName = away.team.displayName;
        const status = comp.status || {};
        const statusType = status.type || {};

        const situation = comp.situation || {};
        scores[`${awayName}|${homeName}`] = {
          home_team: homeName,
          away_team: awayName,
          home_score: home.score || '0',
          away_score: away.score || '0',
          status: statusType.description || 'Scheduled',
          state: statusType.state || 'pre',
          period: status.period || 0,
          display_clock: status.displayClock || '',
          status_detail: statusType.detail || '',
          commence_time: event.date || '',
          balls: situation.balls ?? null,
          strikes: situation.strikes ?? null,
          outs: situation.outs ?? null,
          on_first: situation.onFirst ?? false,
          on_second: situation.onSecond ?? false,
          on_third: situation.onThird ?? false,
        };
      }
    }
    return NextResponse.json(scores);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

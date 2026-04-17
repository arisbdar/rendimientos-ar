// Proxies World Cup 2026 data from openfootball (free, no API key)
const DATA_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

async function fetchData() {
  const r = await fetch(DATA_URL, { headers: { 'User-Agent': 'rendimientos.co/1.0' } });
  if (!r.ok) throw new Error(`GitHub raw ${r.status}`);
  return r.json();
}

// Build group standings from match results
function buildStandings(matches) {
  const groups = {};
  for (const m of matches) {
    if (!m.group) continue;
    const g = m.group.replace('Group ', '');
    if (!groups[g]) groups[g] = {};
    for (const team of [m.team1, m.team2]) {
      if (!groups[g][team]) groups[g][team] = { team, played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, points: 0 };
    }
    // Only count if match has a score
    const s1 = m.score1 ?? (m.score && m.score.ft ? m.score.ft[0] : null);
    const s2 = m.score2 ?? (m.score && m.score.ft ? m.score.ft[1] : null);
    if (s1 == null || s2 == null) continue;
    const t1 = groups[g][m.team1], t2 = groups[g][m.team2];
    t1.played++; t2.played++;
    t1.gf += s1; t1.ga += s2;
    t2.gf += s2; t2.ga += s1;
    if (s1 > s2) { t1.won++; t1.points += 3; t2.lost++; }
    else if (s1 < s2) { t2.won++; t2.points += 3; t1.lost++; }
    else { t1.draw++; t2.draw++; t1.points++; t2.points++; }
  }
  // Sort each group
  const result = {};
  for (const [g, teams] of Object.entries(groups)) {
    result[g] = Object.values(teams).sort((a, b) =>
      b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf
    );
  }
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');

  try {
    const raw = await fetchData();
    const allMatches = raw.matches || [];

    const groupMatches = allMatches.filter(m => m.group);
    const knockoutMatches = allMatches.filter(m => !m.group && m.round);

    const standings = buildStandings(groupMatches);

    res.status(200).json({
      name: raw.name || 'World Cup 2026',
      standings,
      matches: {
        group: groupMatches.map(m => ({
          round: m.round,
          date: m.date,
          time: m.time || null,
          team1: m.team1,
          team2: m.team2,
          score1: m.score1 ?? (m.score && m.score.ft ? m.score.ft[0] : null),
          score2: m.score2 ?? (m.score && m.score.ft ? m.score.ft[1] : null),
          group: m.group.replace('Group ', ''),
          city: m.ground || null,
        })),
        knockout: knockoutMatches.map(m => ({
          round: m.round,
          num: m.num || null,
          date: m.date,
          time: m.time || null,
          team1: m.team1,
          team2: m.team2,
          score1: m.score1 ?? (m.score && m.score.ft ? m.score.ft[0] : null),
          score2: m.score2 ?? (m.score && m.score.ft ? m.score.ft[1] : null),
          city: m.ground || null,
        })),
      },
      updated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Mundial API error:', err.message);
    res.status(502).json({ error: 'Failed to fetch World Cup data', detail: err.message });
  }
}

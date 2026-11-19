/**
 * Wichtel-Auslosung: Jede Person beschenkt genau eine andere und wird von genau einer beschenkt.
 * Ausschlüsse sind gerichtet ("giver darf receiver nicht ziehen").
 *
 * Verfahren: zufällige Reihenfolge + Backtracking, wobei immer zuerst die Person mit den wenigsten
 * verbleibenden Möglichkeiten zugeordnet wird. Für Familiengrößen (bis ~100) ist das sofort fertig;
 * gibt es keine gültige Zuordnung, wird das sicher erkannt (bzw. nach einem Rechenlimit abgebrochen).
 */

export type Pair = { giver: string; receiver: string };

const key = (giver: string, receiver: string) => `${giver}\u0000${receiver}`;

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function draw(participants: string[], exclusions: Pair[], random: () => number = Math.random, maxSteps = 200_000): Pair[] | null {
  const n = participants.length;
  if (n < 2) return null;
  const forbidden = new Set(exclusions.map((e) => key(e.giver, e.receiver)));
  const allowed = (g: string, r: string) => g !== r && !forbidden.has(key(g, r));

  const options = new Map(participants.map((g) => [g, shuffle(participants.filter((r) => allowed(g, r)), random)]));
  const assigned = new Map<string, string>();
  const taken = new Set<string>();
  let steps = 0;

  function solve(): boolean {
    if (assigned.size === n) return true;
    if (++steps > maxSteps) return false;
    // Person mit den wenigsten freien Optionen zuerst (scheitert früh, statt spät)
    let best: string | null = null;
    let bestCount = Infinity;
    for (const g of participants) {
      if (assigned.has(g)) continue;
      let c = 0;
      for (const r of options.get(g)!) if (!taken.has(r)) c++;
      if (c < bestCount) {
        best = g;
        bestCount = c;
        if (c <= 1) break;
      }
    }
    if (!best || bestCount === 0) return false;
    for (const r of options.get(best)!) {
      if (taken.has(r)) continue;
      assigned.set(best, r);
      taken.add(r);
      if (solve()) return true;
      assigned.delete(best);
      taken.delete(r);
    }
    return false;
  }

  if (!solve()) return null;
  return participants.map((g) => ({ giver: g, receiver: assigned.get(g)! }));
}

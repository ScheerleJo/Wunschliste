import { describe, expect, it } from "vitest";
import { draw, type Pair } from "../src/services/draw.ts";

function isValid(people: string[], result: Pair[] | null, exclusions: Pair[] = []) {
  if (!result) return false;
  const givers = new Set(result.map((p) => p.giver));
  const receivers = new Set(result.map((p) => p.receiver));
  return (
    result.length === people.length &&
    givers.size === people.length &&
    receivers.size === people.length &&
    result.every((p) => p.giver !== p.receiver) &&
    result.every((p) => !exclusions.some((e) => e.giver === p.giver && e.receiver === p.receiver))
  );
}

describe("Auslosung", () => {
  it("ergibt immer eine gültige Zuordnung ohne Selbstbeschenkung", () => {
    const people = Array.from({ length: 12 }, (_, i) => `p${i}`);
    for (let i = 0; i < 200; i++) expect(isValid(people, draw(people, []))).toBe(true);
  });

  it("beachtet Ausschlüsse (Paare ziehen sich nicht gegenseitig)", () => {
    const people = ["Josia", "Frau", "Oma", "Opa", "Tante", "Onkel"];
    const couples = [["Josia", "Frau"], ["Oma", "Opa"], ["Tante", "Onkel"]];
    const ex = couples.flatMap(([a, b]) => [{ giver: a!, receiver: b! }, { giver: b!, receiver: a! }]);
    for (let i = 0; i < 200; i++) expect(isValid(people, draw(people, ex), ex)).toBe(true);
  });

  it("ist zufällig verteilt", () => {
    const people = ["a", "b", "c", "d"];
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(draw(people, [])!.find((p) => p.giver === "a")!.receiver);
    expect([...seen].sort()).toEqual(["b", "c", "d"]);
  });

  it("erkennt unmögliche Fälle", () => {
    const people = ["a", "b", "c"];
    const allExcluded = people.flatMap((g) => people.filter((r) => r !== g).map((r) => ({ giver: g, receiver: r })));
    expect(draw(people, allExcluded)).toBeNull();
    // 3er-Haushalt + 1 Person: niemand kann die Einzelperson-Bedingung erfüllen
    const hh = ["a", "b", "c"].flatMap((g) => ["a", "b", "c"].filter((r) => r !== g).map((r) => ({ giver: g, receiver: r })));
    expect(draw(["a", "b", "c", "d"], hh)).toBeNull();
    expect(draw(["a"], [])).toBeNull();
  });

  it("bleibt bei großen Gruppen schnell", () => {
    const people = Array.from({ length: 120 }, (_, i) => `p${i}`);
    const ex = people.flatMap((p, i) => (i % 2 === 0 ? [{ giver: p, receiver: people[i + 1]! }, { giver: people[i + 1]!, receiver: p }] : []));
    const t = performance.now();
    expect(isValid(people, draw(people, ex), ex)).toBe(true);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

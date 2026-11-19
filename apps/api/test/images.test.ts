import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../src/db/index.ts";
import { wishImage } from "../src/db/schema.ts";
import { resolveUpload } from "../src/services/images.ts";
import { call, createUser, fetchRaw, resetDb, upload, type TestUser } from "./helpers.ts";

let anna: TestUser, ben: TestUser, erik: TestUser;
let annaP: string, wishId: string;

/** Großes JPEG mit GPS-Daten und EXIF-Ausrichtung, wie es vom Handy käme */
async function phonePhoto() {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Make: "Handy" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 8/1 0/1" } })
    .toBuffer();
}

beforeEach(async () => {
  await resetDb();
  anna = await createUser("Anna");
  ben = await createUser("Ben");
  erik = await createUser("Erik");
  annaP = (await call(anna, "GET", "/me")).body.profile.id;
  const g = (await call(anna, "POST", "/groups", { name: "Familie" })).body.id;
  const inv = await call(anna, "POST", `/groups/${g}/invites`, {});
  await call(ben, "POST", `/invites/${inv.body.url.split("/").pop()}/accept`);
  wishId = (await call(anna, "POST", `/profiles/${annaP}/wishes`, { title: "Pullover" })).body.id;
});

describe("Bilder", () => {
  it("werden verkleinert, gedreht, als WebP gespeichert und Metadaten entfernt", async () => {
    const res = await upload(anna, `/wishes/${wishId}/images`, await phonePhoto());
    expect(res.status).toBe(201);
    // Orientation 6 = um 90° gedreht: aus 3000x2000 wird hochkant 1067x1600
    expect(res.body).toMatchObject({ width: 1067, height: 1600 });

    const full = await fetchRaw(anna, `/images/${res.body.id}`);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(full.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();

    const thumb = await sharp((await fetchRaw(anna, `/images/${res.body.id}/thumb`)).data).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBe(480);
  });

  it("erscheinen in der Besitzer- und Schenkenden-Sicht", async () => {
    const img = (await upload(anna, `/wishes/${wishId}/images`, await phonePhoto())).body;
    expect((await call(anna, "GET", `/profiles/${annaP}/wishes`)).body[0].images).toEqual([img]);
    expect((await call(ben, "GET", `/profiles/${annaP}/list`)).body.wishes[0].images).toEqual([img]);
  });

  it("sind nur für Berechtigte abrufbar", async () => {
    const img = (await upload(anna, `/wishes/${wishId}/images`, await phonePhoto())).body;
    expect((await fetchRaw(ben, `/images/${img.id}`)).status).toBe(200);
    expect((await fetchRaw(erik, `/images/${img.id}`)).status).toBe(404);
    expect((await fetchRaw(null, `/images/${img.id}`)).status).toBe(401);
  });

  it("nur der Besitzer darf hochladen und löschen", async () => {
    expect((await upload(ben, `/wishes/${wishId}/images`, await phonePhoto())).status).toBe(404);
    const img = (await upload(anna, `/wishes/${wishId}/images`, await phonePhoto())).body;
    expect((await call(ben, "DELETE", `/wishes/${wishId}/images/${img.id}`)).status).toBe(404);
  });

  it("Nicht-Bilder und SVG werden abgelehnt", async () => {
    const txt = await upload(anna, `/wishes/${wishId}/images`, Buffer.from("hallo"), "bild.jpg");
    expect(txt.status).toBe(400);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    expect((await upload(anna, `/wishes/${wishId}/images`, svg, "x.svg", "image/svg+xml")).status).toBe(400);
  });

  it("höchstens 8 Bilder pro Wunsch", async () => {
    const small = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
    for (let i = 0; i < 8; i++) expect((await upload(anna, `/wishes/${wishId}/images`, small, "a.png", "image/png")).status).toBe(201);
    expect((await upload(anna, `/wishes/${wishId}/images`, small, "a.png", "image/png")).status).toBe(400);
  });

  it("Löschen entfernt auch die Dateien", async () => {
    const img = (await upload(anna, `/wishes/${wishId}/images`, await phonePhoto())).body;
    const [row] = await db.select().from(wishImage).where(eq(wishImage.id, img.id));
    expect(existsSync(resolveUpload(row!.filePath))).toBe(true);
    await call(anna, "DELETE", `/wishes/${wishId}/images/${img.id}`);
    expect(existsSync(resolveUpload(row!.filePath))).toBe(false);
    expect(existsSync(resolveUpload(row!.thumbPath))).toBe(false);
  });

  it("neues Bild gilt als Änderung für Reservierende", async () => {
    await call(ben, "POST", `/wishes/${wishId}/reserve`);
    await new Promise((r) => setTimeout(r, 20));
    await upload(anna, `/wishes/${wishId}/images`, await phonePhoto());
    expect((await call(ben, "GET", "/reservations")).body[0].state).toBe("changed");
  });

  it("Reservierende sehen Bilder auch nach dem Löschen des Wunsches", async () => {
    const img = (await upload(anna, `/wishes/${wishId}/images`, await phonePhoto())).body;
    await call(ben, "POST", `/wishes/${wishId}/reserve`);
    await call(anna, "DELETE", `/wishes/${wishId}`);
    expect((await fetchRaw(ben, `/images/${img.id}/thumb`)).status).toBe(200);
    expect((await fetchRaw(anna, `/images/${img.id}/thumb`)).status).toBe(404);
  });
});

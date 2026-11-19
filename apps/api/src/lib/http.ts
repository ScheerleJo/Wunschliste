import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";

/** Liest den JSON-Body und validiert ihn. Bei Fehlern: 400 mit der ersten Fehlermeldung. */
export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  const body = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Ungültiger Request-Body" });
  });
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HTTPException(400, { message: result.error.issues[0]?.message ?? "Ungültige Eingabe" });
  }
  return result.data;
}

export const notFound = (what = "Nicht gefunden") => new HTTPException(404, { message: what });
export const forbidden = (message = "Keine Berechtigung") => new HTTPException(403, { message });
export const badRequest = (message: string) => new HTTPException(400, { message });

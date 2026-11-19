/** Kurzer, lesbarer Name für einen Link, z. B. "amazon.de" */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

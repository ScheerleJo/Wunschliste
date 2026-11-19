function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Umgebungsvariable ${name} fehlt (siehe .env.example)`);
  return value;
}

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  appUrl: required("APP_URL", isProduction ? undefined : "http://localhost:5173"),
  databaseUrl: required(
    "DATABASE_URL",
    isProduction ? undefined : "postgres://wunschliste:wunschliste@localhost:5432/wunschliste",
  ),
  authSecret: required("BETTER_AUTH_SECRET", isProduction ? undefined : "dev-secret-nicht-in-produktion-verwenden"),
  smtp: {
    host: process.env.SMTP_HOST || undefined,
    port: Number(process.env.SMTP_PORT ?? 1025),
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
  },
  mailFrom: process.env.MAIL_FROM ?? "Wunschliste <wunschliste@localhost>",
  uploadDir: process.env.UPLOAD_DIR ?? "./data/uploads",
};

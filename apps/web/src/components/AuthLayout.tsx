import type { ReactNode } from "react";
import { APP_NAME, APP_TAGLINE } from "@wunschliste/shared";
import { Card } from "./ui.tsx";

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-stone-500">{APP_TAGLINE}</p>
        </div>
        <Card>
          <h2 className="mb-4 text-lg font-semibold">{title}</h2>
          {children}
        </Card>
      </div>
    </div>
  );
}

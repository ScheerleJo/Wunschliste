import type React from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-stone-200 bg-white p-6 shadow-sm ${className}`}>{children}</div>;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-700/50",
    secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100",
    ghost: "text-stone-600 hover:bg-stone-100",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      <input
        className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        {...props}
      />
      {error && <span className="mt-1 block text-sm text-brand-700">{error}</span>}
    </label>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success"; children: ReactNode }) {
  const styles = kind === "error" ? "border-brand-100 bg-brand-50 text-brand-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

export function TextArea({ label, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      <textarea
        rows={2}
        className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        {...props}
      />
    </label>
  );
}

export function Badge({ children, tone = "stone" }: { children: ReactNode; tone?: "stone" | "brand" | "amber" }) {
  const styles = {
    stone: "bg-stone-100 text-stone-600",
    brand: "bg-brand-50 text-brand-700",
    amber: "bg-amber-50 text-amber-700",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

export function Spinner() {
  return <div className="p-8 text-center text-stone-500">Lädt …</div>;
}

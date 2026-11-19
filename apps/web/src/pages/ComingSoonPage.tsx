import { Card } from "../components/ui.tsx";

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <Card>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-stone-600">Kommt in einem der nächsten Schritte.</p>
    </Card>
  );
}

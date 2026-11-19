import { Card } from "../components/ui.tsx";
import { useMe } from "../lib/use-me.ts";

export function HomePage() {
  const { data: me } = useMe();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Hallo {me?.user.name} 👋</h1>
      <Card>
        <h2 className="font-semibold">Meine Wunschliste</h2>
        <p className="mt-1 text-sm text-stone-600">Hier kannst du bald deine Wünsche anlegen, mit Links und Bildern.</p>
      </Card>
    </div>
  );
}

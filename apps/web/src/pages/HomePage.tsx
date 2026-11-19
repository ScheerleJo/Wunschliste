import { Spinner } from "../components/ui.tsx";
import { WishlistManager } from "../components/WishlistManager.tsx";
import { useMe } from "../lib/use-me.ts";

export function HomePage() {
  const { data: me } = useMe();
  if (!me) return <Spinner />;
  return <WishlistManager profileId={me.profile.id} />;
}

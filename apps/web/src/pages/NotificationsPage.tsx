import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Spinner } from "../components/ui.tsx";
import { notificationsApi } from "../lib/api.ts";
import { Icon } from "../components/Icon.tsx";

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["notifications"], queryFn: notificationsApi.list });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const read = useMutation({ mutationFn: notificationsApi.read, onSuccess: refresh });
  const readAll = useMutation({ mutationFn: notificationsApi.readAll, onSuccess: refresh });

  if (list.isPending) return <Spinner />;
  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Benachrichtigungen</h1>
        {(list.data?.unread ?? 0) > 0 && (
          <Button variant="secondary" onClick={() => readAll.mutate()}>
            Alle als gelesen markieren
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <Card className="text-center">
          <p className="text-4xl text-brand-700"><Icon name="bell" /></p>
          <p className="mt-2 text-sm text-stone-600">Keine Benachrichtigungen.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <Card className={`p-4! ${n.read ? "opacity-70" : "border-brand-500/40!"}`}>
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="ungelesen" />}
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">{n.title}</h2>
                    <p className="mt-1 text-sm text-stone-600">{n.body}</p>
                    <p className="mt-1 text-xs text-stone-400">
                      {new Date(n.createdAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {!n.read && (
                    <Button variant="ghost" className="py-1.5! text-xs" onClick={() => read.mutate(n.id)}>
                      Gelesen
                    </Button>
                  )}
                  {n.linkPath && (
                    <Link to={n.linkPath} onClick={() => !n.read && read.mutate(n.id)}>
                      <Button className="py-1.5! text-xs">{n.linkLabel ?? "Öffnen"} <Icon name="forward" /></Button>
                    </Link>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

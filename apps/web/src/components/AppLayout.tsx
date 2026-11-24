import { NavLink, Outlet, useNavigate } from "react-router";
import { APP_NAME } from "@wunschliste/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, reservationsApi } from "../lib/api.ts";
import { authClient } from "../lib/auth-client.ts";
import { useMe } from "../lib/use-me.ts";
import { Icon, type IconName } from "./Icon.tsx";

const navItems = [
  { to: "/liste", label: "Meine Liste", icon: "gift" as IconName },
  { to: "/gruppen", label: "Gruppen", icon: "groups" as IconName },
  { to: "/reservierungen", label: "Reserviert", icon: "reserve" as IconName },
  { to: "/events", label: "Events", icon: "events" as IconName },
];

export function AppLayout() {
  const { data: me } = useMe();
  // Anzahl Reservierungen mit Hinweis (geändert/gelöscht/archiviert/kein Zugriff)
  const reservations = useQuery({ queryKey: ["reservations"], queryFn: reservationsApi.mine, refetchInterval: 60_000 });
  const noticeCount = reservations.data?.filter((r) => r.state !== "ok").length ?? 0;
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: notificationsApi.list, refetchInterval: 60_000 });
  const unread = notifications.data?.unread ?? 0;
  const badge = (to: string) =>
    to === "/reservierungen" && noticeCount > 0 ? (
      <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
        {noticeCount}
      </span>
    ) : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    navigate("/anmelden");
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-stone-600 hover:bg-stone-100"}`;

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <NavLink to="/" aria-label="Startseite" className="flex items-center gap-2 font-semibold">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            {APP_NAME}
          </NavLink>
          <nav className="hidden flex-1 gap-1 sm:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/liste"} className={linkClass}>
                {item.label}
                {badge(item.to)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm sm:ml-0">
            <NavLink
              to="/benachrichtigungen"
              aria-label={unread ? `Benachrichtigungen (${unread} ungelesen)` : "Benachrichtigungen"}
              className="relative rounded-lg px-2.5 py-2 text-lg leading-none text-stone-600 hover:bg-stone-100"
            >
              <Icon name="bell" />
              {unread > 0 && (
                <span className="absolute top-0.5 right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </NavLink>
            <span className="hidden text-stone-500 md:inline">{me?.user.name}</span>
            <button onClick={signOut} className="rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-100">
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>

      {/* Untere Navigationsleiste fürs Handy */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/liste"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-xs ${isActive ? "text-brand-700" : "text-stone-500"}`
            }
          >
            <span className="relative text-lg leading-none">
              <Icon name={item.icon} />
              <span className="absolute -top-1 -right-3">{badge(item.to)}</span>
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

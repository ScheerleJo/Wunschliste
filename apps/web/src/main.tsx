import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider, useLocation, useSearchParams } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { AppLayout } from "./components/AppLayout.tsx";
import { ComingSoonPage } from "./pages/ComingSoonPage.tsx";
import { GroupDetailPage } from "./pages/GroupDetailPage.tsx";
import { GroupsPage } from "./pages/GroupsPage.tsx";
import { InvitePage } from "./pages/InvitePage.tsx";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { RegisterPage } from "./pages/RegisterPage.tsx";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.tsx";
import { useMe } from "./lib/use-me.ts";
import { safeRedirect } from "./lib/auth-client.ts";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

/** Leitet nicht angemeldete Benutzer zur Anmeldung um. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending, isError } = useMe();
  const location = useLocation();
  if (isPending) return <div className="p-8 text-center text-stone-500">Lädt …</div>;
  if (isError || !data) {
    const here = location.pathname + location.search;
    return <Navigate to={here === "/" ? "/anmelden" : `/anmelden?weiter=${encodeURIComponent(here)}`} replace />;
  }
  return children;
}

/** Bereits angemeldete Benutzer brauchen die Anmeldeseiten nicht. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { data, isPending } = useMe();
  const [params] = useSearchParams();
  if (isPending) return null;
  if (data) return <Navigate to={safeRedirect(params.get("weiter"))} replace />;
  return children;
}

const router = createBrowserRouter([
  { path: "/anmelden", element: <GuestOnly><LoginPage /></GuestOnly> },
  { path: "/registrieren", element: <GuestOnly><RegisterPage /></GuestOnly> },
  { path: "/einladung/:token", element: <InvitePage /> },
  { path: "/passwort-vergessen", element: <ForgotPasswordPage /> },
  { path: "/passwort-zuruecksetzen", element: <ResetPasswordPage /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/gruppen", element: <GroupsPage /> },
      { path: "/gruppen/:groupId", element: <GroupDetailPage /> },
      { path: "/reservierungen", element: <ComingSoonPage title="Meine Reservierungen" /> },
      { path: "/events", element: <ComingSoonPage title="Events & Wichteln" /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

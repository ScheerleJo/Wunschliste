import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AuthLayout } from "../components/AuthLayout.tsx";
import { RegisterForm } from "../components/RegisterForm.tsx";
import { invitesApi } from "../lib/api.ts";
import { APP_NAME } from "@wunschliste/shared";

/**
 * Registrierung ohne Einladung ist nur für das allererste Konto möglich (Einrichtung).
 * Alle anderen kommen über /einladung/:token.
 */
export function RegisterPage() {
  const { data, isPending } = useQuery({ queryKey: ["registration-status"], queryFn: invitesApi.registrationStatus });

  return (
    <AuthLayout title={data?.firstUser ? "Einrichtung: erstes Konto" : "Konto erstellen"}>
      {isPending ? null : data?.firstUser ? (
        <>
          <p className="mb-4 text-sm text-stone-600">
            Es gibt noch kein Konto. Du richtest „{APP_NAME}“ ein. Danach kannst du Gruppen anlegen und andere einladen.
          </p>
          <RegisterForm />
        </>
      ) : (
        <p className="text-sm text-stone-600">
          Ein Konto bekommst du über eine <b>Einladung</b>. Bitte jemanden aus deiner Familie, dir einen Einladungslink zu einer Gruppe
          zu schicken.
        </p>
      )}
      <p className="mt-5 text-center text-sm text-stone-600">
        Schon ein Konto?{" "}
        <Link to="/anmelden" className="font-medium text-brand-700 hover:underline">
          Anmelden
        </Link>
      </p>
    </AuthLayout>
  );
}

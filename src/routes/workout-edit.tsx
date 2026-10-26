import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LoginGate } from "@/components/login-gate";
import { WorkoutPlanEditor } from "@/components/workout-plan-editor";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/workout-edit")({
  // Same reasoning as /workout — personal, login-gated, shouldn't show up in
  // search results.
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: Gate,
});

function Gate() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  if (!authToken) return <LoginGate onUnlock={setAuthToken} />;
  const authHeaders = { Authorization: `Bearer ${authToken}` };
  return <EditView authHeaders={authHeaders} />;
}

function EditView({ authHeaders }: { authHeaders: HeadersInit }) {
  useEffect(() => {
    document.documentElement.classList.remove("day");
  }, []);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-10 md:py-16">
        <header className="mb-4 flex items-center gap-3 sm:mb-8">
          <Link
            to="/workout"
            title="Tilbage til træning"
            aria-label="Tilbage til træning"
            className="on-wallpaper text-foreground/60 transition hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="on-wallpaper text-sm uppercase tracking-[0.2em] text-foreground/75">
              Ugeplan
            </p>
            <h1 className="on-wallpaper mt-1 font-sans text-2xl font-bold tracking-tight leading-none sm:text-3xl">
              Rediger plan
            </h1>
          </div>
        </header>

        <WorkoutPlanEditor authHeaders={authHeaders} />
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}

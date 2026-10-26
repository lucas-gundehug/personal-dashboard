import { Link } from "@tanstack/react-router";
import { Calculator, Home, IdCard } from "lucide-react";

const LINKS = [
  { to: "/" as const, label: "Dashboard", icon: Home },
  { to: "/cv" as const, label: "CV", icon: IdCard },
  { to: "/calculate" as const, label: "Beregner", icon: Calculator },
];

// Shown on the dashboard and /calculate so it's easy to jump between the
// three pages — deliberately left off /cv since that's the one meant to be
// shared standalone with people outside the site. /workout is reached via
// the edge tab (see workout-tab.tsx) instead of living in this list.
export function SiteNav() {
  return (
    <nav className="glass mb-6 flex w-fit gap-1 rounded-full p-1">
      {LINKS.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          activeProps={{
            className:
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm bg-primary text-primary-foreground",
          }}
          activeOptions={{ exact: true }}
        >
          <Icon className="h-3.5 w-3.5" /> {label}
        </Link>
      ))}
    </nav>
  );
}

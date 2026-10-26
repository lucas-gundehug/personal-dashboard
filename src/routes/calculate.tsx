import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Beer,
  Clock,
  Copy,
  Download,
  FlaskConical,
  History,
  Martini,
  Save,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { SiteNav } from "@/components/site-nav";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toaster } from "@/components/ui/sonner";
import { site } from "@/site.config";

const TITLE = "Drikke-beregner";
const DESCRIPTION =
  "Hurtigt estimat over hvor meget fadøl, cocktail-spiritus og shots I skal bestille til en fredagsbar eller et event.";
const PAGE_URL = `${site.siteUrl}/calculate`;

export const Route = createFileRoute("/calculate")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "manifest", href: "/manifest.json" }],
  }),
  component: CalculatePage,
});

type ComponentConfig = {
  key: string;
  label: string;
  containerLabelSingular: string;
  containerLabelPlural: string;
  defaultServingSizeCl: number;
  defaultContainerSizeL: number;
};

type BeverageConfig = {
  id: string;
  label: string;
  icon: LucideIcon;
  servingUnitLabel: string;
  defaultRatePerPersonPerHour: number;
  components: ComponentConfig[];
};

const BEVERAGES: BeverageConfig[] = [
  {
    id: "beer",
    label: "Fadøl",
    icon: Beer,
    servingUnitLabel: "fadøl",
    defaultRatePerPersonPerHour: 1.2,
    components: [
      {
        key: "beer",
        label: "Fadøl",
        containerLabelSingular: "fustage",
        containerLabelPlural: "fustager",
        defaultServingSizeCl: 40,
        defaultContainerSizeL: 25,
      },
    ],
  },
  {
    id: "cocktail",
    label: "Cocktails",
    icon: Martini,
    servingUnitLabel: "cocktail",
    defaultRatePerPersonPerHour: 0.8,
    components: [
      {
        key: "spirit",
        label: "Spiritus",
        containerLabelSingular: "flaske spiritus",
        containerLabelPlural: "flasker spiritus",
        defaultServingSizeCl: 5,
        defaultContainerSizeL: 0.7,
      },
      {
        key: "mixer",
        label: "Mixer",
        containerLabelSingular: "flaske/karton mixer",
        containerLabelPlural: "flasker/kartoner mixer",
        defaultServingSizeCl: 10,
        defaultContainerSizeL: 1,
      },
    ],
  },
  {
    id: "shot",
    label: "Shots",
    icon: FlaskConical,
    servingUnitLabel: "shot",
    defaultRatePerPersonPerHour: 0.6,
    components: [
      {
        key: "shot",
        label: "Shots",
        containerLabelSingular: "flaske",
        containerLabelPlural: "flasker",
        defaultServingSizeCl: 4,
        defaultContainerSizeL: 0.7,
      },
    ],
  },
];

// ---------- State & calculation ----------
type ComponentState = { servingSizeCl: number; containerSizeL: number };
type BeverageState = {
  rate: number;
  bufferPct: number;
  components: Record<string, ComponentState>;
};
type CalcState = { guests: number; hours: number; beverages: Record<string, BeverageState> };
type HistoryEntry = { timestamp: number; name: string; calc: CalcState };

function defaultCalcState(): CalcState {
  return {
    guests: 50,
    hours: 4,
    beverages: Object.fromEntries(
      BEVERAGES.map((beverage) => [
        beverage.id,
        {
          rate: beverage.defaultRatePerPersonPerHour,
          bufferPct: 10,
          components: Object.fromEntries(
            beverage.components.map((component) => [
              component.key,
              {
                servingSizeCl: component.defaultServingSizeCl,
                containerSizeL: component.defaultContainerSizeL,
              },
            ]),
          ),
        },
      ]),
    ),
  };
}

function computeResults(calc: CalcState) {
  return BEVERAGES.map((beverage) => {
    const bState = calc.beverages[beverage.id];
    const totalServings = calc.guests * bState.rate * calc.hours;
    const components = beverage.components.map((component) => {
      const cState = bState.components[component.key];
      const totalVolumeCl = totalServings * cState.servingSizeCl * (1 + bState.bufferPct / 100);
      const containerSizeCl = cState.containerSizeL * 100;
      const containersNeeded = containerSizeCl > 0 ? Math.ceil(totalVolumeCl / containerSizeCl) : 0;
      const totalLiters = totalVolumeCl / 100;
      return { ...component, containersNeeded, totalLiters };
    });
    return { ...beverage, totalServings, components };
  });
}

function csvEscape(value: string) {
  if (/[;"\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// A real .xlsx would need the "xlsx" npm package, whose only current release
// has an unpatched high-severity vulnerability (prototype pollution / ReDoS)
// — not worth pulling in for this. A semicolon-separated CSV with a UTF-8
// BOM opens directly in Excel with æøå intact, which covers the same need.
function downloadCsv(calc: CalcState, results: ReturnType<typeof computeResults>) {
  const rows: string[][] = [
    ["Antal gæster", String(calc.guests)],
    ["Varighed (timer)", String(calc.hours)],
    ["Genereret", new Date().toLocaleString("da-DK")],
    [],
    ["Type", "Del", "Antal", "Enhed", "Liter"],
  ];
  for (const beverage of results) {
    for (const component of beverage.components) {
      rows.push([
        beverage.label,
        component.label,
        String(component.containersNeeded),
        component.containersNeeded === 1
          ? component.containerLabelSingular
          : component.containerLabelPlural,
        component.totalLiters.toLocaleString("da-DK", { maximumFractionDigits: 1 }),
      ]);
    }
  }

  const csv = rows.map((row) => row.map(csvEscape).join(";")).join("\r\n");
  const utf8Bom = String.fromCharCode(0xfeff);
  const blob = new Blob([utf8Bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `drikke-beregning-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Plain-text version of the same combined data (all beverages, not just
// one card) for pasting straight into a message or email.
function buildSummaryText(calc: CalcState, results: ReturnType<typeof computeResults>) {
  const lines = [`Drikke-beregning — ${calc.guests} gæster, ${calc.hours} timer`];
  for (const beverage of results) {
    for (const component of beverage.components) {
      const label =
        beverage.components.length > 1 ? `${beverage.label} – ${component.label}` : beverage.label;
      const containerLabel =
        component.containersNeeded === 1
          ? component.containerLabelSingular
          : component.containerLabelPlural;
      lines.push(
        `${label}: ${component.containersNeeded} ${containerLabel} (≈ ${component.totalLiters.toLocaleString("da-DK", { maximumFractionDigits: 1 })} liter)`,
      );
    }
  }
  return lines.join("\n");
}

// ---------- UI ----------
function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type="number"
        step={step}
        min="0"
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="rounded-md hairline border surface-tint px-2 py-1.5 text-sm outline-none focus:border-primary/60"
      />
    </label>
  );
}

function ComponentCalc({
  component,
  state,
  onChange,
  result,
  showLabel,
}: {
  component: ComponentConfig;
  state: ComponentState;
  onChange: (next: ComponentState) => void;
  result: { containersNeeded: number; totalLiters: number };
  showLabel: boolean;
}) {
  return (
    <div className={showLabel ? "border-t hairline pt-4" : ""}>
      {showLabel && (
        <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {component.label}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label={`Cl pr. ${component.label.toLowerCase()}`}
          value={state.servingSizeCl}
          onChange={(v) => onChange({ ...state, servingSizeCl: v })}
        />
        <NumberField
          label="Beholder i liter"
          value={state.containerSizeL}
          onChange={(v) => onChange({ ...state, containerSizeL: v })}
          step={0.1}
        />
      </div>
      <div className="mt-3">
        <div className="font-display text-2xl tabular-nums">
          {result.containersNeeded}{" "}
          <span className="text-sm text-muted-foreground">
            {result.containersNeeded === 1
              ? component.containerLabelSingular
              : component.containerLabelPlural}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          ≈ {result.totalLiters.toLocaleString("da-DK", { maximumFractionDigits: 1 })} liter
        </div>
      </div>
    </div>
  );
}

function BeverageCard({
  config,
  state,
  onChange,
  result,
}: {
  config: BeverageConfig;
  state: BeverageState;
  onChange: (next: BeverageState) => void;
  result: ReturnType<typeof computeResults>[number];
}) {
  const roundedServings = Math.round(result.totalServings);
  const Icon = config.icon;
  const showComponentLabels = config.components.length > 1;

  return (
    <div className="glass animate-card-in flex flex-col rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl">{config.label}</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label={`${config.servingUnitLabel} pr. person/time`}
          value={state.rate}
          onChange={(v) => onChange({ ...state, rate: v })}
          step={0.1}
        />
        <NumberField
          label="Buffer (%)"
          value={state.bufferPct}
          onChange={(v) => onChange({ ...state, bufferPct: v })}
          step={5}
        />
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        ≈ {roundedServings} {config.servingUnitLabel}
        {roundedServings === 1 ? "" : "s"} i alt
      </div>

      <div className="mt-4 flex-1 space-y-4">
        {config.components.map((component, i) => (
          <ComponentCalc
            key={component.key}
            component={component}
            state={state.components[component.key]}
            onChange={(next) =>
              onChange({
                ...state,
                components: { ...state.components, [component.key]: next },
              })
            }
            result={result.components[i]}
            showLabel={showComponentLabels}
          />
        ))}
      </div>
    </div>
  );
}

function HistoryPanel({
  history,
  onRestore,
}: {
  history: HistoryEntry[];
  onRestore: (entry: HistoryEntry) => void;
}) {
  if (history.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Ingen gemte beregninger endnu.</p>;
  }
  return (
    <ul className="flex flex-col divide-y hairline">
      {history.map((entry) => (
        <li key={entry.timestamp}>
          <button
            type="button"
            onClick={() => onRestore(entry)}
            className="flex w-full flex-col gap-0.5 px-4 py-3 text-left text-sm hover:surface-tint"
          >
            <span className="font-medium">{entry.name || "Uden navn"}</span>
            <span className="text-xs text-muted-foreground">
              {entry.calc.guests} gæster · {entry.calc.hours} timer
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(entry.timestamp).toLocaleString("da-DK", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CalculatePage() {
  useEffect(() => {
    function update() {
      const h = new Date().getHours();
      document.documentElement.classList.toggle("day", h >= 5 && h < 19);
    }
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, []);

  const [calc, setCalc] = useState<CalcState>(defaultCalcState);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const results = computeResults(calc);

  // Shared across devices via /api/public/calc-history (public — see that
  // route's comment for the tradeoff) instead of per-browser localStorage.
  useEffect(() => {
    fetch("/api/public/calc-history")
      .then((r) => r.json())
      .then((data) => setHistory(data.history ?? []))
      .catch(() => {});
  }, []);

  function updateBeverage(id: string, next: BeverageState) {
    setCalc((prev) => ({ ...prev, beverages: { ...prev.beverages, [id]: next } }));
  }

  async function saveToHistory() {
    try {
      const res = await fetch("/api/public/calc-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim(), calc }),
      });
      const data = await res.json();
      if (!res.ok || !data.history) throw new Error(data.error ?? "save_failed");
      setHistory(data.history);
      setSaveName("");
      toast.success("Beregning gemt");
    } catch {
      toast.error("Kunne ikke gemme beregning");
    }
  }

  function restoreFromHistory(entry: HistoryEntry) {
    setCalc(entry.calc);
    setHistoryOpen(false);
    toast.success("Beregning gendannet");
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(buildSummaryText(calc, results));
      toast.success("Resultat kopieret");
    } catch {
      toast.error("Kunne ikke kopiere");
    }
  }

  return (
    <div className="min-h-screen">
      <Toaster position="bottom-center" />
      <div className="mx-auto max-w-5xl px-6 py-12 md:py-20">
        <SiteNav />

        <header className="mb-10">
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">{TITLE}</h1>
          <p className="mt-4 max-w-2xl text-foreground/90">{DESCRIPTION}</p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Alle tal er tommelfingerregler — ret dem til under hvert kort, så de passer til jeres
            erfaring med den konkrete gruppe.
          </p>
        </header>

        <div className="glass mb-8 flex flex-wrap items-end justify-between gap-6 rounded-2xl p-6">
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <NumberField
                label="Antal gæster"
                value={calc.guests}
                onChange={(v) => setCalc((prev) => ({ ...prev, guests: v }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <NumberField
                label="Varighed (timer)"
                value={calc.hours}
                onChange={(v) => setCalc((prev) => ({ ...prev, hours: v }))}
                step={0.5}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveToHistory();
              }}
              placeholder="Navn (valgfrit)"
              className="w-40 rounded-md hairline border surface-tint px-3 py-2 text-sm outline-none focus:border-primary/60"
            />
            <button
              type="button"
              onClick={saveToHistory}
              className="flex items-center gap-1.5 rounded-md hairline border surface-tint px-3 py-2 text-sm hover:surface-tint-strong"
            >
              <Save className="h-4 w-4" /> Gem beregning
            </button>

            <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-md hairline border surface-tint px-3 py-2 text-sm hover:surface-tint-strong"
                >
                  <History className="h-4 w-4" /> Historik
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <HistoryPanel history={history} onRestore={restoreFromHistory} />
              </PopoverContent>
            </Popover>

            <button
              type="button"
              onClick={copySummary}
              className="flex items-center gap-1.5 rounded-md hairline border surface-tint px-3 py-2 text-sm hover:surface-tint-strong"
            >
              <Copy className="h-4 w-4" /> Kopiér
            </button>

            <button
              type="button"
              onClick={() => downloadCsv(calc, results)}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Download className="h-4 w-4" /> Download til Excel
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {BEVERAGES.map((config, i) => (
            <BeverageCard
              key={config.id}
              config={config}
              state={calc.beverages[config.id]}
              onChange={(next) => updateBeverage(config.id, next)}
              result={results[i]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

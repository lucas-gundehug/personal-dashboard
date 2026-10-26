import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { site } from "@/site.config";

const ITEMS: { action: string; result: string }[] = [
  { action: "Klik uret 3×", result: "Dagens ord (Wordle)" },
  { action: `Klik "Godaften, ${site.ownerName}" 3×`, result: "2048" },
  { action: "Klik datoen 3×", result: "Snake" },
  { action: 'Hold "m" nede i 2 sek.', result: "Matrix-regn" },
  { action: 'Hold "t" nede i 2 sek.', result: "Tetris" },
  { action: "Rediger → træk genveje", result: "Omarranger rækkefølgen" },
  { action: "?", result: "Dette snydeark" },
];

export function CheatSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Skjulte ting</DialogTitle>
          <DialogDescription>Alt det dashboardet gemmer på.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {ITEMS.map((item) => (
            <li
              key={item.action}
              className="flex items-center justify-between gap-4 rounded-lg px-2 py-2 text-sm hover:surface-tint"
            >
              <span className="rounded-md hairline border surface-tint px-2 py-1 font-mono text-xs text-foreground">
                {item.action}
              </span>
              <span className="text-right text-muted-foreground">{item.result}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

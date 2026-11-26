import { cn } from "cn";

/**
 * Renders a loop-run summary as one row per point. The analysis writes the summary as a few
 * short newline-separated points (see the prompt in src/lib/loop/analyse.ts); an older
 * single-paragraph summary just renders as one row.
 */
export function SummaryPoints({ text, className }: { text: string; className?: string }) {
  const points = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    <div className={cn("space-y-1.5", className)}>
      {points.map((point, i) => (
        <p key={i} className="leading-relaxed">
          {point}
        </p>
      ))}
    </div>
  );
}

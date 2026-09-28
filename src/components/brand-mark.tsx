import Link from "next/link";

/**
 * Header brand mark, on the purple header band.
 *
 * TODO(logo): replace the text wordmark with the official white logo exported from the
 * Canva Brand kit (public/brand/scrumcraft-logo-white.svg or .png). Brand guide: white
 * logo on dark backgrounds, at least 50px wide, clear space = height of the "S".
 */
export function BrandMark() {
  return (
    <Link href="/" className="flex items-baseline gap-2 py-1 pr-3" aria-label="ScrumCraft Marketing Loop — dashboard">
      <span className="text-xl font-black tracking-tight">ScrumCraft</span>
      <span className="text-sm font-bold text-primary-foreground/80">Marketing Loop</span>
    </Link>
  );
}

import Image from "next/image";
import Link from "next/link";
import logoWhite from "../../public/brand/scrumcraft-logo-white-horizontal.png";

/**
 * Header brand mark on the purple band. Brand guide: white logo on dark backgrounds,
 * at least 50px wide (here ~109px), clear space ≥ the height of the "S" (~12px at this
 * size) — kept by the header padding and the gap before the app name.
 */
export function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-4 py-1" aria-label="ScrumCraft Marketing Loop — dashboard">
      <Image src={logoWhite} alt="ScrumCraft" height={32} priority className="h-8 w-auto" />
      <span className="border-l border-primary-foreground/30 pl-4 text-sm font-bold text-primary-foreground/85">
        Marketing Loop
      </span>
    </Link>
  );
}

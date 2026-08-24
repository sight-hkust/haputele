import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/primitives/button";
import { cn } from "@/lib/cn";

// Back navigation, styled as an actual button (#60). Every page previously
// inlined the same string — 11px grey uppercase mono — which read as decoration
// rather than something you could click. Borrowing buttonVariants keeps the
// border, hover and focus-ring identical to every other secondary button
// instead of maintaining a parallel set of styles.
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-fit", className)}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}

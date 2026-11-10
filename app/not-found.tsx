import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface-subtle p-6">
      <div className="max-w-sm text-center">
        <p className="issue-key text-muted-foreground">ERREUR 404</p>
        <h1 className="mt-2 text-h1 font-semibold">Page introuvable</h1>
        <p className="mt-2 text-body text-muted-foreground">Cette page n&apos;existe pas ou vous n&apos;y avez pas accès.</p>
        <Button asChild variant="primary" className="mt-5">
          <Link href="/tableau-de-bord">Retour au tableau de bord</Link>
        </Button>
      </div>
    </main>
  );
}

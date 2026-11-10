"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createReleaseAction } from "@/modules/releases/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";

export function NewReleaseButton({ projectId, projectKey }: { projectId: string; projectKey: string }) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  return (
    <>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus aria-hidden />Nouvelle version</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setPending(true);
              const r = await createReleaseAction({ projectId, name: String(f.get("name")), version: String(f.get("version")), plannedDate: (f.get("date") as string) || null });
              setPending(false);
              if (!r.ok) return void toast.error(r.error);
              router.push(`/projets/${projectKey}/versions/${r.data}`);
            }}
          >
            <DialogHeader><DialogTitle>Nouvelle version</DialogTitle></DialogHeader>
            <DialogBody>
              <label className="flex flex-col gap-1.5 text-body-sm font-medium text-fg-secondary">Nom *<Input name="name" required minLength={2} maxLength={80} placeholder="Ex. : Facturation récurrente" /></label>
              <label className="flex flex-col gap-1.5 text-body-sm font-medium text-fg-secondary">Numéro de version *<Input name="version" required pattern="[0-9A-Za-z][0-9A-Za-z.\-+]{0,31}" placeholder="3.3.0" className="font-mono" /></label>
              <label className="flex flex-col gap-1.5 text-body-sm font-medium text-fg-secondary">Date prévue<Input name="date" type="date" className="w-48" /></label>
            </DialogBody>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" variant="primary" loading={pending}>Créer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

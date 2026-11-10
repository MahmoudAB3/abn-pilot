"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { completeSprintAction, createSprintAction, startSprintAction, updateSprintAction } from "@/modules/sprints/actions";
import { formatDate, toDateInput } from "@/lib/format";

const schema = z
  .object({ name: z.string().trim().max(60), goal: z.string().trim().max(500), startDate: z.string().min(1, "Date requise."), endDate: z.string().min(1, "Date requise.") })
  .refine((v) => v.endDate >= v.startDate, { message: "La date de fin doit suivre la date de début.", path: ["endDate"] });
type V = z.infer<typeof schema>;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function SprintFormDialog({ projectId, sprint, trigger }: { projectId: string; sprint?: { id: string; name: string; goal: string; startDate: string; endDate: string }; trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const start = new Date();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: sprint ? { name: sprint.name, goal: sprint.goal, startDate: toDateInput(sprint.startDate), endDate: toDateInput(sprint.endDate) } : { name: "", goal: "", startDate: iso(start), endDate: iso(new Date(start.getTime() + 13 * 86_400_000)) },
  });
  const onSubmit = async (v: V) => {
    const r = sprint ? await updateSprintAction({ sprintId: sprint.id, ...v, name: v.name || sprint.name }) : await createSprintAction({ projectId, ...v, name: v.name || undefined });
    if (!r.ok) return void toast.error(r.error);
    toast.success(sprint ? "Sprint mis à jour" : "Sprint créé");
    setOpen(false);
    if (!sprint) reset();
    router.refresh();
  };
  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger ?? <Button size="sm" variant="secondary"><Plus aria-hidden />Créer un sprint</Button>}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-col">
            <DialogHeader><DialogTitle>{sprint ? `Modifier ${sprint.name}` : "Nouveau sprint"}</DialogTitle><DialogDescription>Deux semaines par défaut.</DialogDescription></DialogHeader>
            <DialogBody>
              <Field id="sp-name" label="Nom" hint={sprint ? undefined : "Laisser vide pour « Sprint N »."}><Input {...register("name")} /></Field>
              <Field id="sp-goal" label="Objectif du sprint"><Textarea {...register("goal")} rows={2} placeholder="Ex. : livrer les transferts inter-dépôts" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field id="sp-start" label="Début" required error={errors.startDate?.message}><Input type="date" {...register("startDate")} /></Field>
                <Field id="sp-end" label="Fin" required error={errors.endDate?.message}><Input type="date" {...register("endDate")} /></Field>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" variant="primary" loading={isSubmitting}>{sprint ? "Enregistrer" : "Créer"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function StartSprintButton({ sprint, disabledReason }: { sprint: { id: string; name: string; startDate: string; endDate: string; points: number; count: number }; disabledReason?: string }) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  return (
    <>
      <Button size="xs" variant="primary" onClick={() => setOpen(true)} disabled={!!disabledReason} title={disabledReason}><Play aria-hidden />Démarrer</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Démarrer {sprint.name} ?</DialogTitle><DialogDescription>Du {formatDate(sprint.startDate)} au {formatDate(sprint.endDate)}.</DialogDescription></DialogHeader>
          <DialogBody>
            <p className="text-body">{sprint.count} ticket(s), <strong>{sprint.points} points</strong> engagés. L&apos;engagement est figé au démarrage et sert au calcul de la vélocité.</p>
            <p className="text-body-sm text-muted-foreground">Les tickets encore en « Backlog » passent dans le premier statut « À faire ».</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="primary" loading={pending} onClick={async () => { setPending(true); const r = await startSprintAction({ sprintId: sprint.id }); setPending(false); if (!r.ok) return void toast.error(r.error); toast.success(`${sprint.name} démarré`); setOpen(false); router.refresh(); }}>Démarrer le sprint</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CompleteSprintButton({ sprint, unfinished, done, planned, size = "sm" }: { sprint: { id: string; name: string }; unfinished: number; done: number; planned: { id: string; name: string }[]; size?: "xs" | "sm" }) {
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState<string>(planned[0]?.id ?? "backlog");
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  return (
    <>
      <Button size={size} variant="secondary" onClick={() => setOpen(true)}><CheckCircle2 aria-hidden />Terminer le sprint</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Terminer {sprint.name}</DialogTitle><DialogDescription>{done} ticket(s) terminé(s) · {unfinished} non terminé(s).</DialogDescription></DialogHeader>
          <DialogBody>
            {unfinished > 0 ? (
              <fieldset>
                <legend className="text-body-sm font-medium text-fg-secondary">Reporter les {unfinished} ticket(s) non terminé(s) vers :</legend>
                <RadioGroup value={target} onValueChange={setTarget} className="mt-2">
                  {planned.map((p) => (
                    <div key={p.id} className="flex items-center gap-2"><RadioGroupItem value={p.id} id={`co-${p.id}`} /><Label htmlFor={`co-${p.id}`} className="font-normal text-foreground">{p.name}</Label></div>
                  ))}
                  <div className="flex items-center gap-2"><RadioGroupItem value="backlog" id="co-backlog" /><Label htmlFor="co-backlog" className="font-normal text-foreground">Le backlog</Label></div>
                </RadioGroup>
              </fieldset>
            ) : (
              <p className="text-body">Tous les tickets sont terminés. Bravo à l&apos;équipe !</p>
            )}
            <p className="text-body-sm text-muted-foreground">Les points livrés sont figés et alimentent la vélocité.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="primary" loading={pending} onClick={async () => { setPending(true); const r = await completeSprintAction({ sprintId: sprint.id, carryOverTo: target }); setPending(false); if (!r.ok) return void toast.error(r.error); toast.success(`${sprint.name} terminé${r.data.carriedOver ? ` · ${r.data.carriedOver} ticket(s) reporté(s)` : ""}`); setOpen(false); router.refresh(); }}>Terminer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

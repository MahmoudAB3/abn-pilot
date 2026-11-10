"use client";
import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { ISSUE_TYPES, PRIORITIES } from "@/lib/domain";
import { createIssueAction } from "@/modules/issues/actions";
import { projectFormDataAction } from "@/modules/projects/actions";
import { IssueTypeIcon, PriorityIcon, UserName } from "./meta";
import { useIssuePanel } from "./issue-panel";

/** Formulaire (valeurs de champs) : validé ici avec Zod, puis revalidé côté serveur. */
const formSchema = z
  .object({
    projectId: z.string().min(1, "Choisissez un projet."),
    type: z.enum(["EPIC", "STORY", "TASK", "BUG", "SUBTASK"]),
    title: z.string().trim().min(3, "Le résumé doit contenir au moins 3 caractères.").max(240, "240 caractères maximum."),
    description: z.string().max(50_000),
    priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "LOWEST"]),
    assigneeId: z.string(),
    sprintId: z.string(),
    parentId: z.string(),
    storyPoints: z.string().regex(/^\d{0,3}$/, "Nombre entier attendu."),
    dueDate: z.string(),
  })
  .refine((v) => v.type !== "SUBTASK" || v.parentId !== "none", { message: "Une sous-tâche doit avoir un ticket parent.", path: ["parentId"] });
type FormValues = z.infer<typeof formSchema>;

export interface CreateDefaults {
  projectId?: string;
  statusId?: string;
  sprintId?: string | null;
  parentId?: string;
  type?: FormValues["type"];
}

const Ctx = React.createContext<{ openCreate: (d?: CreateDefaults) => void }>({ openCreate: () => {} });
export const useCreateIssue = () => React.useContext(Ctx);

export function CreateIssueProvider({ projects, currentProjectId, children }: { projects: { id: string; key: string; name: string }[]; currentProjectId?: string; children: React.ReactNode }) {
  const [defaults, setDefaults] = React.useState<CreateDefaults | null>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!projects.length) return;
      if (e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey && !e.altKey && !t.closest("input,textarea,select,[contenteditable],[role=dialog],[role=combobox]")) {
        e.preventDefault();
        setDefaults({});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [projects.length]);
  return (
    <Ctx.Provider value={{ openCreate: (d) => setDefaults(d ?? {}) }}>
      {children}
      <Dialog open={!!defaults} onOpenChange={(o) => !o && setDefaults(null)}>
        <DialogContent size="lg">
          {defaults && (projects.length ? <CreateForm projects={projects} defaults={{ projectId: currentProjectId, ...defaults }} onDone={() => setDefaults(null)} /> : <NoProject />)}
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

function NoProject() {
  return (
    <>
      <DialogHeader><DialogTitle>Créer un ticket</DialogTitle></DialogHeader>
      <DialogBody><p className="text-body text-muted-foreground">Vous n&apos;êtes membre d&apos;aucun projet où créer des tickets.</p></DialogBody>
    </>
  );
}

function CreateForm({ projects, defaults, onDone }: { projects: { id: string; key: string; name: string }[]; defaults: CreateDefaults; onDone: () => void }) {
  const router = useRouter();
  const panel = useIssuePanel();
  const [another, setAnother] = React.useState(false);
  const { register, handleSubmit, control, watch, reset, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectId: defaults.projectId && projects.some((p) => p.id === defaults.projectId) ? defaults.projectId : projects[0]!.id,
      type: defaults.type ?? "STORY",
      title: "",
      description: "",
      priority: "MEDIUM",
      assigneeId: "none",
      sprintId: defaults.sprintId ?? "none",
      parentId: defaults.parentId ?? "none",
      storyPoints: "",
      dueDate: "",
    },
  });
  const projectId = watch("projectId");
  const type = watch("type");
  const fd = useQuery({
    queryKey: ["project-form", projectId],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await projectFormDataAction({ projectId });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
  const parents = type === "SUBTASK" ? fd.data?.parents : type === "EPIC" ? [] : fd.data?.epics;

  const onSubmit = async (v: FormValues) => {
    const r = await createIssueAction({
      projectId: v.projectId,
      title: v.title,
      description: v.description,
      type: v.type,
      priority: v.priority,
      assigneeId: v.assigneeId === "none" ? null : v.assigneeId,
      sprintId: v.type === "EPIC" || v.sprintId === "none" ? null : v.sprintId,
      parentId: v.parentId === "none" || v.type === "EPIC" ? null : v.parentId,
      storyPoints: v.storyPoints === "" ? null : Number(v.storyPoints),
      dueDate: v.dueDate || null,
      statusId: defaults.statusId && v.projectId === defaults.projectId ? defaults.statusId : null,
      labelIds: [],
    } as never);
    if (!r.ok) {
      for (const [k, msgs] of Object.entries(r.fieldErrors ?? {})) if (msgs?.[0]) setError(k as keyof FormValues, { message: msgs[0] });
      toast.error(r.error);
      return;
    }
    toast.success(`Ticket ${r.data.key} créé`, { action: { label: "Ouvrir", onClick: () => panel.open(r.data.key) } });
    router.refresh();
    if (another) reset({ ...v, title: "", description: "", storyPoints: "" });
    else onDone();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>Créer un ticket</DialogTitle>
        <DialogDescription>Raccourci : touche C depuis n&apos;importe quel écran. Champs marqués d&apos;un * obligatoires.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ci-projet" label="Projet" required error={errors.projectId?.message}>
            {(c) => (
              <Controller control={control} name="projectId" render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => { field.onChange(v); reset({ ...watch(), projectId: v, sprintId: "none", parentId: "none", assigneeId: "none" }); }}>
                  <SelectTrigger {...c}><SelectValue /></SelectTrigger>
                  <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.key})</SelectItem>)}</SelectContent>
                </Select>
              )} />
            )}
          </Field>
          <Field id="ci-type" label="Type" required>
            {(c) => (
              <Controller control={control} name="type" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger {...c}><SelectValue /></SelectTrigger>
                  <SelectContent>{ISSUE_TYPES.map((t) => <SelectItem key={t} value={t}><IssueTypeIcon type={t} withLabel /></SelectItem>)}</SelectContent>
                </Select>
              )} />
            )}
          </Field>
        </div>
        <Field id="ci-titre" label="Résumé" required error={errors.title?.message} hint="Une phrase claire, orientée résultat.">
          <Input {...register("title")} placeholder="Ex. : Exporter les factures au format PDF" autoFocus maxLength={240} />
        </Field>
        <Field id="ci-desc" label="Description" hint="Markdown pris en charge.">
          <Textarea {...register("description")} rows={4} placeholder="Contexte, critères d'acceptation…" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="ci-assigne" label="Assigné">
            {(c) => (
              <Controller control={control} name="assigneeId" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger {...c}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Non assigné</SelectItem>
                    <SelectSeparator />
                    {(fd.data?.members ?? []).map((m) => <SelectItem key={m.id} value={m.id}><UserName user={m} /></SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            )}
          </Field>
          <Field id="ci-prio" label="Priorité">
            {(c) => (
              <Controller control={control} name="priority" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger {...c}><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}><PriorityIcon priority={p} withLabel /></SelectItem>)}</SelectContent>
                </Select>
              )} />
            )}
          </Field>
          <Field id="ci-points" label="Story points" error={errors.storyPoints?.message}>
            <Input {...register("storyPoints")} inputMode="numeric" placeholder="—" disabled={type === "EPIC"} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="ci-sprint" label="Sprint">
            {(c) => (
              <Controller control={control} name="sprintId" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={type === "EPIC" || !fd.data?.permissions.includes("sprint.manage")}>
                  <SelectTrigger {...c}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Backlog</SelectItem>
                    {(fd.data?.sprints ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.status === "ACTIVE" ? " · actif" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            )}
          </Field>
          <Field id="ci-parent" label={type === "SUBTASK" ? "Parent" : "Épopée"} required={type === "SUBTASK"} error={errors.parentId?.message}>
            {(c) => (
              <Controller control={control} name="parentId" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={type === "EPIC"}>
                  <SelectTrigger {...c}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{type === "SUBTASK" ? "Choisir…" : "Aucune"}</SelectItem>
                    {(parents ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.key} · {p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            )}
          </Field>
          <Field id="ci-due" label="Échéance">
            <Input type="date" {...register("dueDate")} />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter className="sm:items-center">
        <div className="mr-auto flex items-center gap-2">
          <Checkbox id="ci-autre" checked={another} onCheckedChange={(c) => setAnother(!!c)} />
          <Label htmlFor="ci-autre" className="font-normal">Créer un autre</Label>
        </div>
        <Button type="button" variant="ghost" onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>Créer</Button>
      </DialogFooter>
    </form>
  );
}

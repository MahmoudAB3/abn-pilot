"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/sonner";
import { createProjectAction } from "@/modules/projects/actions";
import { displayName, type UserLite } from "@/lib/serialize";
import { UserAvatar } from "@/components/pilotage/meta";

const schema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères.").max(80),
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, "2 à 10 caractères : lettres majuscules et chiffres, en commençant par une lettre."),
  description: z.string().max(2000),
  targetDate: z.string(),
});
type V = z.infer<typeof schema>;

function suggestKey(name: string) {
  const words = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const k = words.length > 1 ? words.map((w) => w[0]).join("") : words[0]!.slice(0, 3);
  return k.slice(0, 6);
}

export function NewProjectDialog({ users }: { users: UserLite[] }) {
  const [open, setOpen] = React.useState(false);
  const [members, setMembers] = React.useState<string[]>([]);
  const router = useRouter();
  const { register, handleSubmit, setValue, watch, setError, reset, formState: { errors, isSubmitting, dirtyFields } } = useForm<V>({ resolver: zodResolver(schema), defaultValues: { name: "", key: "", description: "", targetDate: "" } });
  const name = watch("name");
  React.useEffect(() => {
    if (!dirtyFields.key) setValue("key", suggestKey(name));
  }, [name, dirtyFields.key, setValue]);
  const onSubmit = async (v: V) => {
    const r = await createProjectAction({ ...v, memberIds: members, targetDate: v.targetDate || null });
    if (!r.ok) {
      if (r.code === "CONFLICT") setError("key", { message: r.error });
      else toast.error(r.error);
      return;
    }
    toast.success(`Projet ${r.data.key} créé`);
    setOpen(false);
    reset();
    router.push(`/projets/${r.data.key}`);
  };
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}><Plus aria-hidden />Nouveau projet</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-col">
            <DialogHeader>
              <DialogTitle>Nouveau projet</DialogTitle>
              <DialogDescription>La clé préfixe tous les tickets (ex. ERP-14) et ne pourra plus être modifiée.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
                <Field id="np-name" label="Nom" required error={errors.name?.message}><Input {...register("name")} autoFocus placeholder="Ex. : Synergie ERP" /></Field>
                <Field id="np-key" label="Clé" required error={errors.key?.message}><Input {...register("key")} className="font-mono uppercase" maxLength={10} /></Field>
              </div>
              <Field id="np-desc" label="Description"><Textarea {...register("description")} rows={3} /></Field>
              <Field id="np-date" label="Date de livraison cible" hint="Facultatif."><Input type="date" {...register("targetDate")} className="w-48" /></Field>
              <fieldset>
                <legend className="text-body-sm font-medium text-fg-secondary">Membres</legend>
                <p className="text-caption text-muted-foreground">Vous êtes ajouté automatiquement comme responsable. Les observateurs restent en lecture seule.</p>
                <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                  {users.map((u) => (
                    <li key={u.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-hover">
                      <Checkbox id={`m-${u.id}`} checked={members.includes(u.id)} onCheckedChange={(c) => setMembers((m) => (c ? [...m, u.id] : m.filter((x) => x !== u.id)))} />
                      <label htmlFor={`m-${u.id}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-body-sm"><UserAvatar user={u} size="xs" decorative /><span className="truncate">{displayName(u)}</span></label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" variant="primary" loading={isSubmitting}>Créer le projet</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, LogOut, MoreHorizontal, UserMinus, UserPlus, UserCheck, X } from "lucide-react";
import { approveRequestAction, changeRoleAction, deactivateUserAction, inviteUserAction, reactivateUserAction, rejectRequestAction, revokeSessionsAction } from "@/modules/admin/actions";
import { roleLabels } from "@/lib/labels";
import { formatDateTime, timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { UserAvatar } from "@/components/pilotage/meta";

type Role = keyof typeof roleLabels;
const ROLES = Object.keys(roleLabels) as Role[];
interface Member { id: string; userId: string; role: Role; status: "INVITED" | "ACTIVE" | "DEACTIVATED"; invitedAt: string; user: { id: string; name: string | null; email: string; image: string | null; lastLoginAt: string | null; _count: { sessions: number; projectMembers: number } } }
interface Request { id: string; email: string; name: string | null; hostedDomain: string; requestedAt: string }

const statusBadge = { ACTIVE: <Badge variant="success">Actif</Badge>, INVITED: <Badge variant="info">Invité</Badge>, DEACTIVATED: <Badge variant="neutral">Désactivé</Badge> };

function InviteDialog({ projects, domains }: { projects: { id: string; key: string; name: string }[]; domains: string[] }) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const router = useRouter();
  const schema = z.object({ email: z.string().trim().toLowerCase().email("Adresse invalide.").refine((v) => !domains.length || domains.includes(v.split("@")[1] ?? ""), `Domaines autorisés : ${domains.join(", ")}`), name: z.string().max(80), role: z.enum(ROLES as [Role, ...Role[]]) });
  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", name: "", role: "DEVELOPER" } });
  return (
    <>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}><UserPlus aria-hidden />Inviter</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <form noValidate onSubmit={handleSubmit(async (v) => { const r = await inviteUserAction({ ...v, name: v.name || undefined, projectIds: selected }); if (!r.ok) return void toast.error(r.error); toast.success(`${v.email} invité(e) — accès actif dès sa première connexion Google`); setOpen(false); reset(); setSelected([]); router.refresh(); })} className="flex min-h-0 flex-col">
            <DialogHeader><DialogTitle>Inviter une personne</DialogTitle><DialogDescription>Aucune inscription libre : seule une invitation (ou l&apos;approbation d&apos;une demande) donne accès.</DialogDescription></DialogHeader>
            <DialogBody>
              <Field id="inv-email" label="E-mail Google Workspace" required error={errors.email?.message}><Input type="email" {...register("email")} placeholder={`prenom.nom@${domains[0] ?? "domaine.ma"}`} autoFocus /></Field>
              <Field id="inv-name" label="Nom" hint="Facultatif — repris de Google à la connexion."><Input {...register("name")} /></Field>
              <Field id="inv-role" label="Rôle" required>
                {(c) => (
                  <Select value={watch("role")} onValueChange={(v) => setValue("role", v as Role)}>
                    <SelectTrigger {...c}><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </Field>
              <fieldset>
                <legend className="text-body-sm font-medium text-fg-secondary">Projets</legend>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {projects.map((p) => <label key={p.id} className="flex items-center gap-2 text-body-sm"><Checkbox checked={selected.includes(p.id)} onCheckedChange={(c) => setSelected((s) => (c ? [...s, p.id] : s.filter((x) => x !== p.id)))} />{p.name} ({p.key})</label>)}
                </div>
              </fieldset>
            </DialogBody>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" variant="primary" loading={isSubmitting}>Envoyer l&apos;invitation</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function UsersClient({ members, requests, projects, me, domains }: { members: Member[]; requests: Request[]; projects: { id: string; key: string; name: string }[]; me: string; domains: string[] }) {
  const router = useRouter();
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    const r = await fn();
    if (!r.ok) toast.error(r.error ?? "Erreur");
    else {
      toast.success(msg);
      router.refresh();
    }
  };
  const [approveRole, setApproveRole] = React.useState<Record<string, Role>>({});
  return (
    <div className="flex flex-col gap-4">
      {requests.length > 0 && (
        <Card className="overflow-hidden border-warning/40">
          <CardHeader><div><CardTitle>Demandes d&apos;accès ({requests.length})</CardTitle><CardDescription>Personnes du domaine autorisé qui se sont connectées sans invitation.</CardDescription></div></CardHeader>
          <Table>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><p className="font-medium">{r.name ?? r.email}</p><p className="text-caption text-muted-foreground">{r.email} · domaine {r.hostedDomain} · {timeAgo(r.requestedAt)}</p></TableCell>
                  <TableCell className="w-60">
                    <Select value={approveRole[r.id] ?? "DEVELOPER"} onValueChange={(v) => setApproveRole((s) => ({ ...s, [r.id]: v as Role }))}>
                      <SelectTrigger size="sm" aria-label="Rôle à attribuer"><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLES.map((x) => <SelectItem key={x} value={x}>{roleLabels[x]}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="w-48">
                    <div className="flex gap-1">
                      <Button size="xs" variant="primary" onClick={() => run(() => approveRequestAction({ requestId: r.id, role: approveRole[r.id] ?? "DEVELOPER" }), "Accès approuvé")}><Check aria-hidden />Approuver</Button>
                      <Button size="xs" variant="ghost" onClick={() => run(() => rejectRequestAction({ requestId: r.id }), "Demande refusée")}><X aria-hidden />Refuser</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Card className="overflow-hidden">
        <CardHeader><div><CardTitle>Membres de l&apos;organisation</CardTitle><CardDescription>Domaines Google Workspace autorisés : {domains.join(", ") || "aucun (configurez ALLOWED_GOOGLE_DOMAINS)"}</CardDescription></div><InviteDialog projects={projects} domains={domains} /></CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent"><TableHead>Personne</TableHead><TableHead className="w-64">Rôle</TableHead><TableHead className="w-28">Statut</TableHead><TableHead className="hidden w-44 lg:table-cell">Dernière connexion</TableHead><TableHead className="w-10"><span className="sr-only">Actions</span></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5"><UserAvatar user={m.user} size="sm" decorative /><div className="min-w-0"><p className="truncate font-medium">{m.user.name ?? m.user.email}{m.userId === me && <span className="ml-1.5 text-caption text-muted-foreground">(vous)</span>}</p><p className="truncate text-caption text-muted-foreground">{m.user.email} · {m.user._count.projectMembers} projet(s)</p></div></div>
                </TableCell>
                <TableCell>
                  <Select value={m.role} disabled={m.status === "DEACTIVATED"} onValueChange={(v) => run(() => changeRoleAction({ userId: m.userId, role: v as Role }), "Rôle modifié")}>
                    <SelectTrigger size="sm" aria-label={`Rôle de ${m.user.email}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell>{statusBadge[m.status]}</TableCell>
                <TableCell className="hidden text-caption text-muted-foreground lg:table-cell">{m.user.lastLoginAt ? formatDateTime(m.user.lastLoginAt) : "Jamais"}</TableCell>
                <TableCell>
                  {m.userId !== me && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon-xs" variant="ghost" aria-label={`Actions pour ${m.user.email}`}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={!m.user._count.sessions} onSelect={() => run(() => revokeSessionsAction({ userId: m.userId }), "Sessions révoquées")}><LogOut aria-hidden />Révoquer les sessions ({m.user._count.sessions})</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {m.status === "DEACTIVATED" ? (
                          <DropdownMenuItem onSelect={() => run(() => reactivateUserAction({ userId: m.userId }), "Compte réactivé")}><UserCheck aria-hidden />Réactiver</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem destructive onSelect={() => run(() => deactivateUserAction({ userId: m.userId }), "Compte désactivé, sessions révoquées")}><UserMinus aria-hidden />Désactiver</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

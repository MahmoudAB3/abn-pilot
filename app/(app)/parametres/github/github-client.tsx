"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, GitBranch, Link2, Lock, RefreshCw, RotateCcw, Unlink } from "lucide-react";
import type { integrationStatus } from "@/modules/github/service";
import type { Jsonify } from "@/lib/jsonify";
import { formatDateTime, timeAgo } from "@/lib/format";
import { linkRepositoryAction, retryEventAction, triggerSyncAction, unlinkRepositoryAction, disconnectInstallationAction } from "@/modules/github/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Status = Jsonify<Awaited<ReturnType<typeof integrationStatus>>>;

const notices: Record<string, { ok: boolean; text: string }> = {
  connecte: { ok: true, text: "Installation GitHub connectée. Liez maintenant les dépôts à vos projets." },
  state: { ok: false, text: "Le lien d'installation a expiré ou n'a pas été initié depuis Pilotage. Recommencez depuis cette page." },
  compte: { ok: false, text: "Ce compte GitHub n'est pas autorisé (GITHUB_ALLOWED_OWNERS)." },
  api: { ok: false, text: "GitHub n'a pas pu confirmer l'installation. Réessayez dans un instant." },
  installation: { ok: false, text: "Identifiant d'installation invalide." },
  configuration: { ok: false, text: "La GitHub App n'est pas configurée sur le serveur (variables GITHUB_APP_*)." },
};

function copy(v: string) {
  navigator.clipboard.writeText(v).then(() => toast.success("Copié"));
}

export function GitHubSettingsClient({ status, appUrl, appSlug, notice }: { status: Status; appUrl: string; appSlug: string | null; notice: string | null }) {
  const router = useRouter();
  const n = notice ? notices[notice] : null;
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    const r = await fn();
    if (!r.ok) toast.error(r.error ?? "Erreur");
    else {
      toast.success(msg);
      router.refresh();
    }
  };
  const active = status.installations.filter((i) => !i.revokedAt);
  return (
    <div className="flex flex-col gap-4">
      {n && (
        <div role="status" className={`flex items-start gap-2 rounded-md border p-3 text-body-sm ${n.ok ? "border-success/30 bg-success-subtle text-success-subtle-foreground" : "border-destructive/30 bg-destructive-subtle text-destructive-subtle-foreground"}`}>
          {n.ok ? <CheckCircle2 className="mt-0.5 size-4" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4" aria-hidden />}
          {n.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>GitHub App</CardTitle>
            <CardDescription>Une seule application pour toute l&apos;organisation : aucun jeton personnel n&apos;est requis ni stocké.</CardDescription>
          </div>
          {status.configured ? <Badge variant="success">Configurée</Badge> : <Badge variant="warning">Non configurée</Badge>}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {status.configured ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" asChild><a href="/api/github/install"><GitBranch aria-hidden />{active.length ? "Ajouter ou modifier une installation" : "Connecter l'organisation GitHub"}</a></Button>
              {appSlug && <Button variant="outline" size="sm" asChild><a href={`https://github.com/apps/${appSlug}`} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden />Page de l&apos;application</a></Button>}
            </div>
          ) : (
            <p className="text-body-sm text-muted-foreground">Créez une GitHub App (guide : <code className="font-mono">docs/GITHUB_APP.md</code>), puis renseignez GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY et GITHUB_WEBHOOK_SECRET.</p>
          )}
          <dl className="grid gap-2 rounded-md border bg-surface-subtle p-3 text-body-sm sm:grid-cols-[12rem_1fr]">
            <dt className="text-muted-foreground">URL du webhook</dt>
            <dd className="flex items-center gap-2"><code className="truncate font-mono text-caption">{appUrl}/api/github/webhook</code><Button size="icon-xs" variant="ghost" aria-label="Copier" onClick={() => copy(`${appUrl}/api/github/webhook`)}><Copy aria-hidden /></Button></dd>
            <dt className="text-muted-foreground">URL de configuration</dt>
            <dd className="flex items-center gap-2"><code className="truncate font-mono text-caption">{appUrl}/api/github/setup</code><Button size="icon-xs" variant="ghost" aria-label="Copier" onClick={() => copy(`${appUrl}/api/github/setup`)}><Copy aria-hidden /></Button></dd>
            <dt className="text-muted-foreground">Permissions minimales</dt>
            <dd className="text-caption">Contents : lecture · Pull requests : lecture · Metadata : lecture. Évènements : Push, Pull request, Pull request review, Repository.</dd>
            <dt className="text-muted-foreground">File de traitement</dt>
            <dd className="text-caption">{status.pending} évènement(s) en attente · dernier reçu {status.lastEvent ? `${timeAgo(status.lastEvent.receivedAt)} (${status.lastEvent.event})` : "jamais"}</dd>
          </dl>
        </CardContent>
      </Card>

      {status.installations.map((inst) => (
        <Card key={inst.id} className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">{inst.accountLogin}{inst.revokedAt ? <Badge variant="danger">Révoquée</Badge> : inst.suspendedAt ? <Badge variant="warning">Suspendue</Badge> : <Badge variant="success">Active</Badge>}</CardTitle>
              <CardDescription>Installation #{inst.installationId} · {inst.repositorySelection === "all" ? "tous les dépôts" : "dépôts sélectionnés"} · connectée {timeAgo(inst.createdAt)}</CardDescription>
            </div>
            {!inst.revokedAt && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" asChild><a href={`https://github.com/organizations/${inst.accountLogin}/settings/installations/${inst.installationId}`} target="_blank" rel="noopener noreferrer">Choisir les dépôts sur GitHub</a></Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => disconnectInstallationAction({ installationId: inst.id }), "Installation déconnectée")}><Unlink aria-hidden />Déconnecter</Button>
              </div>
            )}
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Dépôt</TableHead>
                <TableHead>Projets liés</TableHead>
                <TableHead className="w-56">Lier à un projet</TableHead>
                <TableHead className="w-48">Synchronisation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inst.repositories.map((r) => (
                <TableRow key={r.id} className={r.removedAt ? "opacity-60" : undefined}>
                  <TableCell>
                    <a href={r.htmlUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-medium hover:underline">{r.private && <Lock className="size-3.5 text-muted-foreground" aria-label="Privé" />}{r.fullName}</a>
                    {r.removedAt && <span className="text-caption text-destructive">Retiré de l&apos;installation</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.projects.map((p) => (
                        <span key={p.projectId} className="inline-flex items-center gap-1 rounded-sm bg-selected px-1.5 py-0.5 text-caption font-semibold text-selected-foreground">
                          {p.project.key}
                          <button type="button" aria-label={`Délier ${p.project.key}`} className="rounded-xs hover:text-destructive" onClick={() => run(() => unlinkRepositoryAction({ projectId: p.projectId, repositoryId: r.id }), "Dépôt délié")}>×</button>
                        </span>
                      ))}
                      {!r.projects.length && <span className="text-caption text-muted-foreground">Aucun</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {!r.removedAt && !inst.revokedAt && (
                      <Select onValueChange={(projectId) => run(() => linkRepositoryAction({ projectId, repositoryId: r.id }), "Dépôt lié — synchronisation des 30 derniers jours lancée")}>
                        <SelectTrigger size="sm" aria-label={`Lier ${r.fullName} à un projet`}><SelectValue placeholder="Choisir un projet…" /></SelectTrigger>
                        <SelectContent>{status.projects.filter((p) => !r.projects.some((x) => x.projectId === p.id)).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.key})</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-muted-foreground" title={r.syncState?.lastError ?? undefined}>
                        {r.syncState?.lastError ? <span className="text-destructive">Échec</span> : r.syncState?.lastSuccessAt ? timeAgo(r.syncState.lastSuccessAt) : "Jamais"}
                      </span>
                      {r.projects.length > 0 && !r.removedAt && <Button size="icon-xs" variant="ghost" aria-label={`Synchroniser ${r.fullName}`} onClick={() => run(() => triggerSyncAction({ repositoryId: r.id }), "Synchronisation planifiée")}><RefreshCw aria-hidden /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!inst.repositories.length && <TableRow><TableCell colSpan={4} className="text-center text-body-sm text-muted-foreground">Aucun dépôt accessible : sélectionnez des dépôts sur GitHub.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      ))}

      {status.failed.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader><div><CardTitle>Évènements en échec</CardTitle><CardDescription>Après 8 tentatives. Corrigez la cause puis relancez.</CardDescription></div></CardHeader>
          <Table>
            <TableBody>
              {status.failed.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-caption">{e.event}{e.action ? `.${e.action}` : ""}</TableCell>
                  <TableCell className="text-caption text-muted-foreground">{formatDateTime(e.receivedAt)}</TableCell>
                  <TableCell className="max-w-md truncate text-caption text-destructive" title={e.lastError ?? undefined}>{e.lastError}</TableCell>
                  <TableCell className="w-24"><Button size="xs" variant="outline" onClick={() => run(() => retryEventAction({ eventId: e.id }), "Évènement relancé")}><RotateCcw aria-hidden />Relancer</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <p className="flex items-center gap-1.5 text-caption text-muted-foreground"><Link2 className="size-3.5" aria-hidden />Les automatisations de statut se configurent projet par projet (Paramètres du projet), et sont désactivées par défaut.</p>
    </div>
  );
}

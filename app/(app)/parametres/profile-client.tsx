"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut } from "lucide-react";
import { revokeMySessionsAction, updatePrefsAction } from "@/modules/notifications/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { toast } from "@/components/ui/sonner";

const prefLabels = {
  ASSIGNED: ["Assignation", "Quand un ticket vous est assigné."],
  MENTIONED: ["Mentions", "Quand quelqu'un vous mentionne avec @ dans un commentaire."],
  COMMENTED: ["Commentaires", "Sur les tickets que vous suivez."],
  STATUS_CHANGED: ["Changements de statut", "Sur les tickets que vous suivez (désactivé par défaut pour limiter le bruit)."],
  PR_ACTIVITY: ["Activité GitHub", "Ouverture, revue et fusion des pull requests liées à vos tickets."],
} as const;
type Pref = keyof typeof prefLabels;

export function ProfileClient({ user, prefs }: { user: { name: string; email: string; image: string | null; role: string; locale: "fr" | "en"; sessions: number }; prefs: Record<Pref, boolean> }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const [p, setP] = React.useState(prefs);
  const save = async (patch: Partial<Record<Pref, boolean>> & { locale?: "fr" | "en" }) => {
    const r = await updatePrefsAction(patch);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Préférences enregistrées");
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>Profil</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar name={user.name} src={user.image ?? undefined} size="lg" decorative />
          <div>
            <p className="text-h3 font-semibold">{user.name}</p>
            <p className="text-body-sm text-muted-foreground">{user.email} · {user.role}</p>
            <p className="text-caption text-muted-foreground">Nom et photo synchronisés depuis votre compte Google Workspace.</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Notifications</CardTitle><CardDescription>Notifications dans l&apos;application (centre de notifications).</CardDescription></div></CardHeader>
        <CardContent className="divide-y">
          {(Object.keys(prefLabels) as Pref[]).map((k) => (
            <div key={k} className="flex items-start justify-between gap-4 py-3">
              <div><Label htmlFor={`pref-${k}`} className="text-body font-medium text-foreground">{prefLabels[k][0]}</Label><p id={`pref-${k}-d`} className="text-body-sm text-muted-foreground">{prefLabels[k][1]}</p></div>
              <Switch id={`pref-${k}`} aria-describedby={`pref-${k}-d`} checked={p[k]} onCheckedChange={(v) => { setP((x) => ({ ...x, [k]: v })); save({ [k]: v }); }} />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Apparence et langue</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <fieldset>
            <legend className="text-body-sm font-medium text-fg-secondary">Thème</legend>
            <RadioGroup value={mounted ? theme : undefined} onValueChange={setTheme} className="mt-2">
              {[["light", "Clair"], ["dark", "Sombre"], ["system", "Suivre le système"]].map(([v, l]) => <div key={v} className="flex items-center gap-2"><RadioGroupItem value={v!} id={`th-${v}`} /><Label htmlFor={`th-${v}`} className="font-normal text-foreground">{l}</Label></div>)}
            </RadioGroup>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pref-lang">Langue de l&apos;interface</Label>
            <Select value={user.locale} onValueChange={(v) => save({ locale: v as "fr" | "en" })}>
              <SelectTrigger id="pref-lang" className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="fr">Français</SelectItem><SelectItem value="en">English (navigation)</SelectItem></SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Sessions</CardTitle><CardDescription>{user.sessions} session(s) ouverte(s) sur vos appareils.</CardDescription></div></CardHeader>
        <CardContent>
          <Button variant="outline" onClick={async () => { const r = await revokeMySessionsAction({}); if (!r.ok) return void toast.error(r.error); router.push("/connexion?erreur=session"); }}><LogOut aria-hidden />Se déconnecter de tous les appareils</Button>
        </CardContent>
      </Card>
    </div>
  );
}

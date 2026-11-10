"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell, Check, CheckCheck, ChevronsUpDown, CircleHelp, FolderKanban, GitPullRequest, LayoutDashboard, ListOrdered, ListTodo, LogOut, Map, Menu,
  Moon, PanelLeftClose, PanelLeftOpen, PieChart, Plus, Rocket, Search, Settings, SquareKanban, Sun, Timer, UserRound, Users, Laptop, Languages,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { colorFor, labelClass } from "@/lib/domain";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PilotageMark } from "./brand";
import { SearchCommand } from "./search-command";
import { signOutAction } from "@/app/actions/auth";
import { switchProjectAction } from "@/modules/projects/actions";
import { listNotificationsAction, markReadAction, updatePrefsAction } from "@/modules/notifications/actions";
import { useCreateIssue } from "@/components/pilotage/create-issue";
import { useIssuePanel } from "@/components/pilotage/issue-panel";

export interface ShellProps {
  user: { id: string; name: string; email: string; image: string | null; role: string; roleLabel: string };
  projects: { id: string; key: string; name: string }[];
  currentProject: { id: string; key: string; name: string } | null;
  canManageOrg: boolean;
  /** Faux pour un observateur (ou sans projet modifiable) : les actions de création sont masquées. */
  canCreate: boolean;
  children: React.ReactNode;
}

interface NavItem { href: string; label: MessageKey; icon: LucideIcon; match?: RegExp; needsProject?: boolean }

function navFor(key: string | undefined): { title?: MessageKey; items: NavItem[] }[] {
  const p = (s: string) => (key ? `/projets/${key}/${s}` : "/projets");
  return [
    { items: [
      { href: "/tableau-de-bord", label: "nav.dashboard", icon: LayoutDashboard },
      { href: "/mes-taches", label: "nav.myTasks", icon: ListTodo },
      { href: "/projets", label: "nav.projects", icon: FolderKanban, match: /^\/projets(\/?$|\/[A-Z0-9]+\/?$|\/[A-Z0-9]+\/parametres)/ },
    ] },
    { title: "nav.section.project", items: [
      { href: p("backlog"), label: "nav.backlog", icon: ListOrdered, needsProject: true, match: /\/backlog/ },
      { href: p("sprint"), label: "nav.sprint", icon: Timer, needsProject: true, match: /\/sprint/ },
      { href: p("tableau"), label: "nav.board", icon: SquareKanban, needsProject: true, match: /\/tableau$/ },
      { href: p("feuille-de-route"), label: "nav.roadmap", icon: Map, needsProject: true, match: /\/feuille-de-route/ },
      { href: p("versions"), label: "nav.releases", icon: Rocket, needsProject: true, match: /\/versions/ },
    ] },
    { title: "nav.section.org", items: [
      { href: "/rapports", label: "nav.reports", icon: PieChart, match: /^\/rapports|\/projets\/[A-Z0-9]+\/rapports/ },
      { href: "/github", label: "nav.github", icon: GitPullRequest },
      { href: "/equipe", label: "nav.team", icon: Users },
    ] },
  ];
}

function NavLink({ item, collapsed, disabled, onNavigate }: { item: NavItem; collapsed: boolean; disabled?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const active = item.match ? item.match.test(pathname) : pathname === item.href || pathname.startsWith(item.href + "/");
  const label = t(item.label);
  const cls = cn(
    "relative flex h-8 items-center gap-2.5 rounded-md px-2 text-body font-medium transition-colors [&_svg]:size-[18px] [&_svg]:shrink-0",
    active ? "bg-selected text-selected-foreground before:absolute before:top-1.5 before:bottom-1.5 before:-left-2 before:w-[3px] before:rounded-r-full before:bg-primary" : "text-fg-secondary hover:bg-surface-hover hover:text-foreground",
    collapsed && "justify-center px-0",
    disabled && "pointer-events-none opacity-50",
  );
  const link = (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} aria-disabled={disabled || undefined} className={cls}>
      <item.icon aria-hidden />
      {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
    </Link>
  );
  return collapsed ? <Tooltip label={label} side="right">{link}</Tooltip> : link;
}

function Sidebar({ props, collapsed, onNavigate }: { props: ShellProps; collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const sections = navFor(props.currentProject?.key);
  return (
    <div className="flex h-full flex-col">
      {!collapsed && props.currentProject && (
        <div className="px-3 pt-3 pb-1">
          <p className="text-overline-caps text-muted-foreground">{t("nav.section.project")}</p>
          <p className="truncate text-body font-semibold">{props.currentProject.name}</p>
        </div>
      )}
      <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-2 py-2">
        {sections.map((s, i) => (
          <div key={i} className={cn(i > 0 && "mt-4")}>
            {s.title && !collapsed && i !== 1 && <p className="mb-1 px-2 text-overline-caps text-muted-foreground">{t(s.title)}</p>}
            {s.title && collapsed && <div className="mx-2 mb-2 h-px bg-border" aria-hidden />}
            <ul className="flex flex-col gap-0.5">
              {s.items.map((it) => (
                <li key={it.label}><NavLink item={it} collapsed={collapsed} disabled={it.needsProject && !props.currentProject} onNavigate={onNavigate} /></li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t p-2">
        <NavLink item={{ href: "/parametres", label: "nav.settings", icon: Settings }} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function ProjectSwitcher({ props }: { props: ShellProps }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const cur = props.currentProject;
  const go = async (key: string) => {
    await switchProjectAction({ key });
    const m = pathname.match(/^\/projets\/[A-Z0-9]+(\/[a-z-]+)?/);
    router.push(m?.[1] ? `/projets/${key}${m[1]}` : `/projets/${key}/tableau`);
    router.refresh();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-8 min-w-0 items-center gap-2 rounded-md px-1.5 text-left hover:bg-surface-hover data-[state=open]:bg-surface-hover" aria-label={`${t("shell.switchProject")}${cur ? ` (actuel : ${cur.name})` : ""}`}>
        {cur ? (
          <>
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-md font-mono text-[0.625rem] font-bold", labelClass[colorFor(cur.key)])} aria-hidden>{cur.key.slice(0, 2)}</span>
            <span className="hidden max-w-40 truncate text-body font-semibold lg:inline">{cur.name}</span>
          </>
        ) : (
          <span className="text-body text-muted-foreground">{t("nav.noProject")}</span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{t("nav.projects")}</DropdownMenuLabel>
        {props.projects.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => go(p.key)}>
            <span className={cn("grid size-5 shrink-0 place-items-center rounded-sm font-mono text-[0.5625rem] font-bold", labelClass[colorFor(p.key)])} aria-hidden>{p.key.slice(0, 2)}</span>
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="issue-key text-muted-foreground">{p.key}</span>
            {p.key === cur?.key && <Check className="!text-primary-text" aria-hidden />}
          </DropdownMenuItem>
        ))}
        {!props.projects.length && <p className="px-2 py-2 text-body-sm text-muted-foreground">Aucun projet accessible.</p>}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/projets"><FolderKanban aria-hidden />{t("shell.allProjects")}</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Notifications() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const panel = useIssuePanel();
  const { data } = useQuery({
    queryKey: ["notifications"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const r = await listNotificationsAction({});
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
  const unread = data?.unread ?? 0;
  const mark = async (ids: string[] | "all") => {
    await markReadAction({ ids });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  return (
    <Popover>
      <Tooltip label={t("shell.notifications")} side="bottom">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label={`${t("shell.notifications")}${unread ? ` (${unread} non lues)` : ""}`}>
            <Bell aria-hidden />
            {unread > 0 && <span className="absolute top-1 right-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-destructive px-0.5 text-[0.5625rem] font-bold text-destructive-foreground ring-2 ring-background" aria-hidden>{unread > 9 ? "9+" : unread}</span>}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <h2 className="text-h3 font-semibold">{t("shell.notifications")}</h2>
          <Button variant="link" size="xs" disabled={!unread} onClick={() => mark("all")}>Tout marquer comme lu</Button>
        </div>
        <ul className="max-h-[28rem] overflow-y-auto py-1">
          {(data?.items ?? []).map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn("flex w-full gap-3 px-3 py-2.5 text-left hover:bg-surface-hover", !n.readAt && "bg-selected/40")}
                onClick={() => {
                  if (!n.readAt) mark([n.id]);
                  if (n.issue) panel.open(n.issue.key);
                }}
              >
                {n.actor ? <Avatar name={n.actor.name ?? n.actor.email} src={n.actor.image ?? undefined} size="md" decorative /> : <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background"><GitPullRequest className="size-4" aria-hidden /></span>}
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-medium">{n.title}</span>
                  {n.body && <span className="block truncate text-body-sm text-muted-foreground">{n.body}</span>}
                  <span className="text-caption text-muted-foreground">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Non lu" />}
              </button>
            </li>
          ))}
          {data && !data.items.length && (
            <li className="flex flex-col items-center gap-1 px-4 py-8 text-center">
              <CheckCheck className="size-6 text-muted-foreground" aria-hidden />
              <span className="text-body-sm text-muted-foreground">Aucune notification.</span>
            </li>
          )}
        </ul>
        <div className="border-t px-3 py-2 text-right">
          <Link href="/parametres?onglet=notifications" className="text-caption text-primary-text hover:underline">Préférences de notification</Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu({ user }: { user: ShellProps["user"] }) {
  const { t, locale } = useI18n();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full" aria-label={`${t("shell.profile")} : ${user.name}`}>
        <Avatar name={user.name} src={user.image ?? undefined} size="md" decorative className="ring-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar name={user.name} src={user.image ?? undefined} size="md" decorative />
          <div className="min-w-0">
            <p className="truncate text-body font-semibold">{user.name}</p>
            <p className="truncate text-caption text-muted-foreground">{user.email}</p>
            <p className="truncate text-caption text-muted-foreground">{user.roleLabel}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/parametres"><UserRound aria-hidden />{t("shell.profile")}</Link></DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Sun aria-hidden />{t("shell.theme")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light"><Sun aria-hidden />Clair</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark"><Moon aria-hidden />Sombre</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system"><Laptop aria-hidden />Système</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Languages aria-hidden />{t("shell.language")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={locale} onValueChange={async (v) => { await updatePrefsAction({ locale: v as "fr" | "en" }); router.refresh(); }}>
              <DropdownMenuRadioItem value="fr" lang="fr">Français</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="en" lang="en">English</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <button type="submit" className="relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-body text-destructive outline-none hover:bg-destructive-subtle focus-visible:bg-destructive-subtle [&_svg]:size-4">
            <LogOut aria-hidden />
            {t("shell.logout")}
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell(props: ShellProps) {
  const { t } = useI18n();
  const { openCreate } = useCreateIssue();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("pilotage-sidebar") === "collapsed");
    } catch {}
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("pilotage-sidebar", c ? "expanded" : "collapsed");
      } catch {}
      return !c;
    });

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <a href="#contenu" className="sr-only z-[60] rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">{t("shell.skip")}</a>

      {/* Rail global */}
      <div className="hidden w-rail shrink-0 flex-col items-center gap-1 bg-rail py-3 text-rail-foreground md:flex">
        <Link href="/tableau-de-bord" className="mb-3 rounded-md" aria-label="ABNSoft Pilotage — tableau de bord">
          <PilotageMark className="size-8" />
        </Link>
        {[
          { label: t("shell.search"), icon: Search, onClick: () => setSearchOpen(true) },
          ...(props.canCreate ? [{ label: `${t("shell.create")} (C)`, icon: Plus, onClick: () => openCreate() }] : []),
        ].map((b) => (
          <Tooltip key={b.label} label={b.label} side="right">
            <button type="button" onClick={b.onClick} aria-label={b.label} className="grid size-9 place-items-center rounded-md text-rail-foreground transition-colors hover:bg-rail-hover focus-visible:outline-rail-foreground [&_svg]:size-5">
              <b.icon aria-hidden />
            </button>
          </Tooltip>
        ))}
        <div className="mt-auto">
          <Tooltip label="Guide d'utilisation" side="right">
            <Link href="/aide" aria-label="Guide d'utilisation" className="grid size-9 place-items-center rounded-md text-rail-foreground hover:bg-rail-hover [&_svg]:size-5">
              <CircleHelp aria-hidden />
            </Link>
          </Tooltip>
        </div>
      </div>

      <aside aria-label="Barre latérale" className={cn("hidden shrink-0 border-r bg-surface-subtle transition-[width] duration-200 md:block", collapsed ? "w-14" : "w-sidebar")}>
        <Sidebar props={props} collapsed={collapsed} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="bg-surface-subtle p-0" hideClose aria-describedby={undefined}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-12 items-center gap-2 bg-rail px-3 text-rail-foreground">
            <PilotageMark className="size-7" />
            <span className="text-body font-bold">ABNSoft Pilotage</span>
          </div>
          <Sidebar props={props} collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-topbar shrink-0 items-center gap-1.5 border-b bg-background px-2 md:px-3">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("shell.menu")} onClick={() => setMobileOpen(true)} data-touch-target>
            <Menu aria-hidden />
          </Button>
          <Tooltip label={collapsed ? t("shell.expand") : t("shell.collapse")} side="bottom">
            <Button variant="ghost" size="icon" className="hidden md:inline-flex" aria-label={collapsed ? t("shell.expand") : t("shell.collapse")} aria-expanded={!collapsed} onClick={toggle}>
              {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            </Button>
          </Tooltip>
          <ProjectSwitcher props={props} />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="ml-1 hidden h-8 max-w-md flex-1 items-center gap-2 rounded-md border bg-surface-subtle px-2.5 text-body text-muted-foreground transition-colors hover:border-border-strong hover:bg-card sm:flex"
            aria-haspopup="dialog"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t("shell.search")}</span>
            <Kbd className="ml-auto">⌘K</Kbd>
          </button>
          <div className="ml-auto flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="sm:hidden" aria-label={t("shell.search")} onClick={() => setSearchOpen(true)}><Search aria-hidden /></Button>
            {props.canCreate && (
              <Button variant="primary" size="sm" onClick={() => openCreate()} className="mr-1">
                <Plus aria-hidden />
                <span className="hidden sm:inline">{t("shell.create")}</span>
                <span className="sr-only sm:hidden">{t("shell.create")}</span>
              </Button>
            )}
            <Notifications />
            <UserMenu user={props.user} />
          </div>
        </header>
        <main id="contenu" tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-y-auto focus:outline-none">
          {props.children}
        </main>
      </div>
      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

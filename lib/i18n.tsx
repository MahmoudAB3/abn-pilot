"use client";
import * as React from "react";

/**
 * Français par défaut ; anglais optionnel pour l'interface de navigation.
 * La langue est enregistrée dans le profil utilisateur.
 */
export type Locale = "fr" | "en";
const dict = {
  fr: {
    "nav.dashboard": "Tableau de bord", "nav.myTasks": "Mes tâches", "nav.projects": "Projets", "nav.backlog": "Backlog",
    "nav.sprint": "Sprint actif", "nav.board": "Tableau Kanban", "nav.roadmap": "Feuille de route", "nav.releases": "Versions",
    "nav.reports": "Rapports", "nav.github": "Activité GitHub", "nav.team": "Équipe", "nav.settings": "Paramètres",
    "nav.section.project": "Projet", "nav.section.org": "Organisation", "nav.noProject": "Aucun projet",
    "shell.search": "Rechercher tickets, projets, commentaires…", "shell.create": "Créer", "shell.notifications": "Notifications",
    "shell.collapse": "Réduire la barre latérale", "shell.expand": "Déployer la barre latérale", "shell.menu": "Ouvrir le menu",
    "shell.theme": "Thème", "shell.language": "Langue", "shell.profile": "Profil et préférences", "shell.logout": "Se déconnecter",
    "shell.skip": "Aller au contenu principal", "shell.switchProject": "Changer de projet", "shell.allProjects": "Tous les projets",
  },
  en: {
    "nav.dashboard": "Dashboard", "nav.myTasks": "My tasks", "nav.projects": "Projects", "nav.backlog": "Backlog",
    "nav.sprint": "Active sprint", "nav.board": "Kanban board", "nav.roadmap": "Roadmap", "nav.releases": "Releases",
    "nav.reports": "Reports", "nav.github": "GitHub activity", "nav.team": "Team", "nav.settings": "Settings",
    "nav.section.project": "Project", "nav.section.org": "Organization", "nav.noProject": "No project",
    "shell.search": "Search issues, projects, comments…", "shell.create": "Create", "shell.notifications": "Notifications",
    "shell.collapse": "Collapse sidebar", "shell.expand": "Expand sidebar", "shell.menu": "Open menu",
    "shell.theme": "Theme", "shell.language": "Language", "shell.profile": "Profile & preferences", "shell.logout": "Sign out",
    "shell.skip": "Skip to main content", "shell.switchProject": "Switch project", "shell.allProjects": "All projects",
  },
} as const;
export type MessageKey = keyof (typeof dict)["fr"];

const Ctx = React.createContext<{ locale: Locale; t: (k: MessageKey) => string }>({ locale: "fr", t: (k) => dict.fr[k] });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const t = React.useCallback((k: MessageKey) => dict[locale]?.[k] ?? dict.fr[k], [locale]);
  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <Ctx.Provider value={{ locale, t }}>{children}</Ctx.Provider>;
}
export const useI18n = () => React.useContext(Ctx);

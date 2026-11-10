/** Libellés français des énumérations (partagés client/serveur). */
export const typeLabels = { EPIC: "Épopée", STORY: "User Story", TASK: "Tâche", BUG: "Anomalie", SUBTASK: "Sous-tâche" } as const;
export const priorityLabels = { CRITICAL: "Critique", HIGH: "Haute", MEDIUM: "Moyenne", LOW: "Basse", LOWEST: "Très basse" } as const;
export const categoryLabels = { BACKLOG: "Backlog", TODO: "À faire", IN_PROGRESS: "En cours", IN_REVIEW: "En revue", IN_TEST: "En test", DONE: "Terminé" } as const;
export const roleLabels = { ADMIN: "Administrateur", PRODUCT_OWNER: "Product Owner / Chef de projet", DEVELOPER: "Développeur", VIEWER: "Observateur / Direction" } as const;
export const projectRoleLabels = { LEAD: "Responsable", MEMBER: "Membre", VIEWER: "Observateur" } as const;
export const sprintStatusLabels = { PLANNED: "Planifié", ACTIVE: "Actif", COMPLETED: "Terminé" } as const;
export const releaseStatusLabels = { PLANNED: "Planifiée", IN_PROGRESS: "En cours", RELEASED: "Publiée", CANCELLED: "Annulée" } as const;
export const milestoneStatusLabels = { PLANNED: "Planifié", IN_PROGRESS: "En cours", DONE: "Atteint" } as const;
export const projectStatusLabels = { ACTIVE: "Actif", ON_HOLD: "En pause", ARCHIVED: "Archivé" } as const;
export const linkTypeLabels = { BLOCKS: "bloque", RELATES_TO: "est lié à", DUPLICATES: "duplique" } as const;
export const inverseLinkTypeLabels = { BLOCKS: "est bloqué par", RELATES_TO: "est lié à", DUPLICATES: "est dupliqué par" } as const;
export const prStateLabels = { OPEN: "Ouverte", CLOSED: "Fermée", MERGED: "Fusionnée" } as const;
export const reviewStateLabels = { NONE: "Aucune revue", REVIEW_REQUESTED: "Revue demandée", APPROVED: "Approuvée", CHANGES_REQUESTED: "Modifications demandées", COMMENTED: "Commentée" } as const;

export const typeLabel = (t: keyof typeof typeLabels) => typeLabels[t];

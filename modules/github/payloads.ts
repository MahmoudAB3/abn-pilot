import { z } from "zod";

/** Validation des seuls champs utilisés : un payload inattendu est rejeté proprement. */
const account = z.object({ login: z.string(), type: z.string().default("Organization") });
const repoRef = z.object({ id: z.number(), name: z.string(), full_name: z.string(), private: z.boolean().default(true) });
export const repository = repoRef.extend({ owner: z.object({ login: z.string() }), html_url: z.string().url(), default_branch: z.string().default("main") });
const installationRef = z.object({ id: z.number() });

export const installationEvent = z.object({
  action: z.string(),
  installation: installationRef.extend({ account, repository_selection: z.string().default("selected") }),
  repositories: z.array(repoRef).optional(),
});

export const installationRepositoriesEvent = z.object({
  action: z.enum(["added", "removed"]),
  installation: installationRef.extend({ account }),
  repository_selection: z.string().optional(),
  repositories_added: z.array(repoRef).default([]),
  repositories_removed: z.array(repoRef).default([]),
});

export const pushEvent = z.object({
  ref: z.string(),
  installation: installationRef.optional(),
  repository,
  commits: z
    .array(
      z.object({
        id: z.string().regex(/^[0-9a-f]{40}$/),
        message: z.string(),
        timestamp: z.string(),
        url: z.string().url(),
        distinct: z.boolean().default(true),
        author: z.object({ name: z.string(), username: z.string().optional() }),
      }),
    )
    .default([]),
});

export const pullRequest = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable().default(""),
  state: z.enum(["open", "closed"]),
  draft: z.boolean().default(false),
  merged: z.boolean().nullable().default(false),
  merged_at: z.string().nullable().default(null),
  closed_at: z.string().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string().url(),
  user: z.object({ login: z.string() }),
  head: z.object({ ref: z.string() }),
  base: z.object({ ref: z.string() }),
  requested_reviewers: z.array(z.object({ login: z.string() })).default([]),
});

export const pullRequestEvent = z.object({ action: z.string(), installation: installationRef.optional(), repository, pull_request: pullRequest });

export const pullRequestReviewEvent = z.object({
  action: z.string(),
  installation: installationRef.optional(),
  repository,
  pull_request: pullRequest,
  review: z.object({ state: z.string(), user: z.object({ login: z.string() }) }),
});

export const repositoryEvent = z.object({ action: z.string(), installation: installationRef.optional(), repository });

/** Évènements acceptés par le point d'entrée webhook ; les autres sont ignorés. */
export const SUPPORTED_EVENTS = new Set(["ping", "installation", "installation_repositories", "push", "pull_request", "pull_request_review", "repository"]);

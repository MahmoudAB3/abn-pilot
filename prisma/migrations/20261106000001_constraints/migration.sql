-- Contraintes et index que Prisma ne sait pas exprimer.

-- Recherche plein texte (configuration française, pondération clé/titre > description)
ALTER TABLE "Issue" DROP COLUMN IF EXISTS "searchVector";
ALTER TABLE "Issue" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('french', coalesce("key", '')), 'A') ||
  setweight(to_tsvector('french', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('french', coalesce("description", '')), 'B')
) STORED;
CREATE INDEX "Issue_searchVector_idx" ON "Issue" USING GIN ("searchVector");

ALTER TABLE "Comment" DROP COLUMN IF EXISTS "searchVector";
ALTER TABLE "Comment" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  to_tsvector('french', coalesce("body", ''))
) STORED;
CREATE INDEX "Comment_searchVector_idx" ON "Comment" USING GIN ("searchVector");

-- Un seul sprint actif par projet
CREATE UNIQUE INDEX "Sprint_one_active_per_project" ON "Sprint" ("projectId") WHERE "status" = 'ACTIVE';

-- Intégrité
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_not_own_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_story_points_range" CHECK ("storyPoints" IS NULL OR ("storyPoints" >= 0 AND "storyPoints" <= 100));
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_number_positive" CHECK ("number" > 0);
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_not_self" CHECK ("sourceId" <> "targetId");
ALTER TABLE "GitHubIssueLink" ADD CONSTRAINT "GitHubIssueLink_exactly_one_target"
  CHECK ((("commitId" IS NOT NULL)::int + ("pullRequestId" IS NOT NULL)::int) = 1);
ALTER TABLE "Project" ADD CONSTRAINT "Project_key_format" CHECK ("key" ~ '^[A-Z][A-Z0-9]{1,9}$');
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_dates_order" CHECK ("endDate" >= "startDate");
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_minutes_positive" CHECK ("minutes" > 0 AND "minutes" <= 1440);
ALTER TABLE "WorkflowStatus" ADD CONSTRAINT "WorkflowStatus_wip_positive" CHECK ("wipLimit" IS NULL OR "wipLimit" > 0);

-- Recherche par préfixe sur le titre (autocomplétion)
CREATE INDEX "Issue_title_lower_idx" ON "Issue" (lower("title") text_pattern_ops);

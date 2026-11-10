import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCtx } from "@/server/session";
import { orgCan } from "@/server/authz";
import { integrationStatus } from "@/modules/github/service";
import { PageBody } from "@/components/layout/page-header";
import { plain } from "@/lib/serialize";
import { env } from "@/server/env";
import { GitHubSettingsClient } from "./github-client";

export const metadata: Metadata = { title: "Intégration GitHub" };

export default async function GitHubSettings({ searchParams }: { searchParams: Promise<{ erreur?: string; connecte?: string }> }) {
  const ctx = await requirePageCtx();
  if (!orgCan(ctx, "github.manage")) notFound();
  const status = await integrationStatus(ctx);
  const sp = await searchParams;
  return (
    <PageBody className="max-w-5xl">
      <GitHubSettingsClient status={plain(status)} appUrl={env().APP_URL} appSlug={env().GITHUB_APP_SLUG ?? null} notice={sp.connecte ? "connecte" : sp.erreur ?? null} />
    </PageBody>
  );
}

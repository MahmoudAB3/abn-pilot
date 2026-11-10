import { cache } from "react";
import { db } from "./db";
import { env } from "./env";

/** L'instance sert une organisation (ABN Software Synergie). Créée au premier accès si besoin. */
export const getOrganization = cache(async () => {
  const { ORGANIZATION_SLUG, ORGANIZATION_NAME } = env();
  return db.organization.upsert({
    where: { slug: ORGANIZATION_SLUG },
    update: {},
    create: { slug: ORGANIZATION_SLUG, name: ORGANIZATION_NAME },
  });
});

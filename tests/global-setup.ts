import { migrate } from "../scripts/db-migrate";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/pilotage_test?schema=public";
  await migrate(url, () => {});
}

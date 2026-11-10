process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/pilotage_test?schema=public";
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
process.env.ALLOWED_GOOGLE_DOMAINS = "abnsoft.ma";
process.env.ORGANIZATION_SLUG = "abnsoft-test";
process.env.GITHUB_WEBHOOK_SECRET = "webhook-secret-for-tests";
process.env.LOG_LEVEL = "silent";
process.env.UPLOAD_DIR = "./storage/test-uploads";
// NODE_ENV est déjà « test » sous Vitest

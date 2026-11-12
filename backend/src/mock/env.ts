/**
 * APP_MODE=mock without a DATABASE_URL: start an embedded Postgres in backend/.mock-db
 * (persistent between runs), create the tables and seed the demo data once.
 */
import { execSync } from "child_process";
import net from "net";
import path from "path";
import fs from "fs";

const PG_PORT = Number(process.env.MOCK_PG_PORT ?? 54329);
const ROOT = path.resolve(__dirname, "../..");

const isListening = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => (s.end(), resolve(true)));
    s.once("error", () => resolve(false));
  });

export async function prepareMockEnv() {
  console.log("APP_MODE=mock: simulated PayPal, assistant without AI, local database. No money moves.");
  await ensureDatabase();

  const env = { ...process.env };
  execSync("npx prisma db push --skip-generate", { cwd: ROOT, env, stdio: "ignore" });

  // The Prisma client in node_modules is generated from the schema. After a schema change (a pull, a new field) it
  // must be generated again, or every query that touches the new parts fails and the screens never load.
  const schema = path.join(ROOT, "prisma", "schema.prisma");
  const generated = path.join(ROOT, "node_modules", ".prisma", "client", "schema.prisma");
  if (!fs.existsSync(generated) || fs.statSync(generated).mtimeMs < fs.statSync(schema).mtimeMs) {
    console.log("   the data model changed: generating the database client…");
    try {
      execSync("npx prisma generate", { cwd: ROOT, env, stdio: "ignore" });
    } catch {
      console.error("   could not generate the database client. Stop every other backend process and run `npx prisma generate` in backend/.");
    }
  }

  const { db } = await import("../db");
  // the seed is idempotent: it also runs when a newer version added demo data (the groups abroad)
  if ((await db.user.count()) === 0 || !(await db.group.findUnique({ where: { inviteCode: "MADRID" } })) || !(await db.group.findUnique({ where: { inviteCode: "COMERC" } }))) {
    console.log("   seeding demo data…");
    execSync("npx tsx src/seed.ts", { cwd: ROOT, env, stdio: "inherit" });
  }
}

async function ensureDatabase() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/ayni`;
    // `npm run dev` restarts on every change: reuse the database if it is already up.
    if (!(await isListening(PG_PORT))) {
      let EmbeddedPostgres: any;
      try {
        // ESM-only package: a real import() (TypeScript would turn a plain one into require)
        const esmImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;
        EmbeddedPostgres = (await esmImport("embedded-postgres")).default;
      } catch {
        throw new Error("Mock mode needs the dev dependency embedded-postgres (npm install), or set DATABASE_URL.");
      }
      const dir = path.join(ROOT, ".mock-db");
      const pg = new EmbeddedPostgres({
        databaseDir: dir,
        user: "postgres",
        password: "postgres",
        port: PG_PORT,
        persistent: true,
        initdbFlags: ["--encoding=UTF8", "--locale=C"],
        onLog: () => {},
      });
      if (!fs.existsSync(path.join(dir, "PG_VERSION"))) {
        console.log("   creating the local database (first run only)…");
        await pg.initialise();
      }
      await pg.start();
      await pg.createDatabase("ayni").catch(() => {});
    }
  }
}

/** Wipe the mock database (npm run mock:reset): next start seeds everything again. */
export async function resetMockDb() {
  await ensureDatabase();
  const { db } = await import("../db");
  await db.$executeRawUnsafe("DROP SCHEMA public CASCADE");
  await db.$executeRawUnsafe("CREATE SCHEMA public");
  await db.$disconnect();
}

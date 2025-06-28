import { randomBytes } from "crypto";
import { defineConfig } from "cypress";
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { GenericContainer } from "testcontainers";

let database: StartedPostgreSqlContainer | null = null;

export default defineConfig({
  viewportHeight: 1080,
  viewportWidth: 1920,
  defaultCommandTimeout:10000,
  e2e: {
    // experimentalMemoryManagement: true,
    numTestsKeptInMemory: 30,
    setupNodeEvents(on, config) {
      // implement node event listeners here
      on("before:browser:launch", async () => {
        console.log("Starting PostgreSQL container...");
        const dbUser = "postgres";
        const dbPassword = randomBytes(12).toString("hex");
        database = await new PostgreSqlContainer("postgres:13")
          .withDatabase("haputele")
          .withUsername(dbUser)
          .withPassword(dbPassword)
          .withCopyFilesToContainer([
            {
              source: "./schema.sql",
              target: "/docker-entrypoint-initdb.d/init.sql",
            },
          ])
          .start();
        const dbIp = database.getIpAddress(database.getNetworkNames()[0]);
        console.log(`Postgres Password: ${dbPassword}`);
        console.log("Starting ToolJet container...");
        const tooljet = await new GenericContainer(
          "tooljet/tooljet:ee-lts-latest"
        )
          .withPlatform("linux/amd64")
          .withExposedPorts({
            container: 80,
            host: 3080,
          })
          .withEnvironment({
            ORM_LOGGING: "all",
            TOOLJET_HOST: "http://localhost:80",
            LOCKBOX_MASTER_KEY: randomBytes(32).toString("hex"),
            SECRET_KEY_BASE: randomBytes(64).toString("hex"),
            PG_DB: "tooljet_production",
            PG_USER: dbUser,
            PG_HOST: dbIp,
            PG_PORT: "5432",
            PG_PASS: dbPassword,
            TOOLJET_DB: "tooljet_db",
            TOOLJET_DB_USER: dbUser,
            TOOLJET_DB_HOST: dbIp,
            TOOLJET_DB_PASS: dbPassword,
            PGRST_DB_URI: `postgres://${dbUser}:${dbPassword}@${dbIp}/tooljet_db`,
            PGRST_HOST: "localhost:3002",
            PGRST_JWT_SECRET: randomBytes(32).toString("hex"),
            PGRST_SERVER_PORT: "3002",
            USER_SESSION_EXPIRY: "2880",
            SERVE_CLIENT: "true",
            PORT: "80",
          })
          .withCommand(["sh", "-c", "npm run start:prod"])
          .start();
        console.log(
          `Tooljet container is running at http://localhost:${tooljet.getMappedPort(
            80
          )}`
        );
      });
      return config;
    },
  },
});

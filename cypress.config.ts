import { randomBytes } from "crypto";
import { defineConfig } from "cypress";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer } from "testcontainers";

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      // implement node event listeners here
      on("before:browser:launch", async () => {
        console.log("Starting PostgreSQL container...");
        const dbUser = "postgres";
        const dbPassword = randomBytes(12).toString("hex");
        const database = await new PostgreSqlContainer("postgres:13")
          .withDatabase("haputele")
          .withUsername(dbUser)
          .withPassword(dbPassword)
          .withStartupTimeout(120000)
          .withBindMounts([
            {
              source: "./cypress/fixtures/schema.sql",
              target: "/docker-entrypoint-initdb.d/init.sql",
              mode: "ro",
            },
          ])
          .start();
        console.log("Starting ToolJet container...");
        const tooljet = await new GenericContainer(
          "tooljet/tooljet:ee-lts-latest"
        )
          .withExposedPorts(80)
          .withEnvironment({
            ORM_LOGGING: "all",
            TOOLJET_HOST: "http://localhost:80",
            LOCKBOX_MASTER_KEY: randomBytes(32).toString("hex"),
            SECRET_KEY_BASE: randomBytes(64).toString("hex"),
            PG_DB: "tooljet_production",
            PG_USER: dbUser,
            PG_HOST: database.getHost(),
            PG_PORT: "5432",
            PG_PASS: dbPassword,
            TOOLJET_DB: "tooljet_db",
            TOOLJET_DB_USER: dbUser,
            TOOLJET_DB_HOST: database.getHost(),
            TOOLJET_DB_PASS: dbPassword,
            PGRST_DB_URI: `postgres://${dbUser}:${dbPassword}@${database.getHost()}/tooljet_db`,
            PGRST_HOST: "localhost:3002",
            PGRST_JWT_SECRET: randomBytes(32).toString("hex"),
            PGRST_SERVER_PORT: "3002",
            USER_SESSION_EXPIRY: "2880",
          })
          .start();
        console.log(
          `Tooljet container is running at http://localhost:${tooljet.getMappedPort(
            80
          )}`
        );
        config.env.tooljetUrl = `http://localhost:${tooljet.getMappedPort(80)}`;
      });
    },
  },
});

import { randomBytes } from "crypto";
describe("Import App via API", () => {
  let workspaceId = "";
  let slug = "";
  let tj_token = "";
  let csrf_token = "";
  let userId = "";

  it("Authenticate and import app via API", () => {
    cy.request({
      method: "POST",
      url: "http://localhost:3080/api/authenticate",
      body: {
        email: "user@abc.com",
        password: "Pass123=", 
        redirectTo: "/",
      },
      failOnStatusCode: false, 
    }).then((response) => {
      cy.log("Authentication response:", JSON.stringify(response, null, 2));
      expect(response.status).to.eq(201);

      const setCookieHeader = response.headers["set-cookie"];
      if (!setCookieHeader) {
        throw new Error("No set-cookie header found in authentication response");
      }

      const tjAuthCookie = Array.isArray(setCookieHeader)
        ? setCookieHeader.find((cookie) => cookie.includes("tj_auth_token"))
        : setCookieHeader.includes("tj_auth_token")
        ? setCookieHeader
        : null;
      if (!tjAuthCookie) {
        throw new Error("no tj_auth_token");
      }
      tj_token = tjAuthCookie.split(";")[0].split("=")[1];
      expect(tj_token).to.not.be.empty;

      const csrfCookie = Array.isArray(setCookieHeader)
        ? setCookieHeader.find((cookie) => cookie.includes("next-auth.csrf-token"))
        : setCookieHeader.includes("next-auth.csrf-token")
        ? setCookieHeader
        : null;
      if (!csrfCookie) {
        cy.log("no csrf");
        csrf_token = ""; 
      } else {
        csrf_token = csrfCookie.split(";")[0].split("=")[1];
        expect(csrf_token).to.not.be.empty;
      }

      workspaceId = response.body.current_organization_id;
      userId = response.body.id;
      slug = response.body.current_organization_slug;

      expect(workspaceId).to.not.be.empty;
      expect(userId).to.not.be.empty;
      expect(slug).to.not.be.empty;

      cy.log(
        `token: ${tj_token}\n😀csrf_token: ${csrf_token}😀\nworkspaceId: ${workspaceId}😀\nslug: ${slug}😀\nuserId: ${userId} 😅`
      );

      cy.log("APPPP😎😎")
      const appname=randomBytes(12).toString("hex");
      cy.fixture("app.json").then((appData) => {
        const requestBody = {
          organization_id: workspaceId,
          tooljet_version: appData.tooljet_version,
          app: [
            {
              appName: appname, 
              definition: {
                appV2: {
                  ...appData.app[0].definition.appV2,
                  organizationId: workspaceId,
                  userId: userId,
                  name: appname, //can not null, otherwise show empty page due to type error(tolowercase of null)
                  appEnvironments: appData.app[0].definition.appV2.appEnvironments.map((env) => ({
                    ...env,
                    organizationId: workspaceId,
                  })),
                },
              },
            },
          ],
        };

        cy.log("body:", JSON.stringify(requestBody, null, 2));

        const cookieHeader = csrf_token
          ? `tj_auth_token=${tj_token}; next-auth.csrf-token=${csrf_token}`
          : `tj_auth_token=${tj_token}`;

        cy.request({
          method: "POST",
          url: "http://localhost:3080/api/v2/resources/import",
          headers: {
            "Content-Type": "application/json",
            "tj-workspace-id": workspaceId,
            Cookie: cookieHeader,
          },
          body: requestBody,
          failOnStatusCode: false, 
        }).then((response) => {
          cy.log("Import API response:", JSON.stringify(response, null, 2));
          expect(response.status).to.be.oneOf([200, 201]);
          cy.visit(`http://localhost:3080/${slug}`, { failOnStatusCode: false });
          cy.url().should("include", `/${slug}`);
          cy.wait(4000)
          cy.contains(`${appname}`).should("exist"); // Matches the set name

        });
      });
    });
  });
});
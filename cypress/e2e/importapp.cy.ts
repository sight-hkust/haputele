describe("Import App via API", () => {
  let workspaceId = "";
  const accessToken = Cypress.env("EXTERNAL_API_ACCESS_TOKEN"); // Load from .env
  let tj_auth_token = "";
  it("Authenticate via API and verify token", () => {
    cy.visit("http://localhost:3080/login?redirectTo=/");
    cy.request({
      method: "POST",
      url: "http://localhost:3080/api/authenticate",
      body: {
        email: "user@abc.com",
        password: "Pass123=",
        redirectTo: "/",
      },
    }).then((response) => {
      expect(response.status).to.eq(201);
			// cy.log('object in res', JSON.stringify(response.body));
			cy.log("tj_token:", response.headers["set-cookie"][0].split(";")[0].split("=")[1]);
      tj_auth_token = response.headers["set-cookie"][0].split(";")[0].split("=")[1];
    });
    cy.visit("http://localhost:3080/hapu-workspace");
    cy.url().should("include", "/hapu-workspace");

    cy.log("get workspaces");
    cy.request({
      method: "GET",
      url: "http://localhost:3080/api/ext/users",
      headers: {
        Authorization: `Basic ${accessToken}`,
        "Content-Type": "application/json"
      },
    }).then((res) => {
      expect(res.status).to.eq(200);
      cy.log(JSON.stringify(res.body));
    });//cant get shit,external still disabled
  });
});
describe("template spec", () => {
  let tooljetUrl: string;

  before(() => {
    tooljetUrl = Cypress.env("tooljetUrl");
    console.log("ToolJet URL:", tooljetUrl);
  });

  it("passes", () => {
    cy.log(tooljetUrl);
    cy.visit("http://localhost:3080/setup");
    cy.get(".tj-base-btn").click();
    Cypress.on("uncaught:exception", (err, runnable) => {
      return false;
    });

    cy.get('[data-cy="name-input"]').type("Test User");
    cy.get('[data-cy="email-input"]').type("user@test.com");
    cy.get('[data-cy="password-input"]').type("password123");
    cy.get("[type=submit]").click();
    cy.get('[data-cy="onboarding-company-name"]').type("Test Company");
    cy.get('[data-cy="onboarding-build-purpose"]').type("Testing ToolJet");
    cy.get('[data-cy="onboarding-submit"]').click();
    cy.get('[data-cy="onboarding-submit"]').click();
    cy.get(".decline-button").click();
    cy.get('[data-cy="onboarding-submit"]').click();
    cy.visit("http://localhost:3080/test-companys-workspace");
  });
});

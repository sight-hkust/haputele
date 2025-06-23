describe('onboard spec', () => {

  it('Sign up', () => {
    cy.visit('http://localhost:3080/');
    cy.contains('Set up').click();
    Cypress.on("uncaught:exception", (err, runnable) => {
      return false;
    });
    cy.get('[data-cy="name-input"]').type('John Doe');
    cy.get('[data-cy="email-input"]').type("user@abc.com");
    cy.get('[data-cy="password-input"]').type("Pass123=");
    cy.contains('Sign up').click();
    cy.get('[data-cy="onboarding-company-name"]').type('Test Company');
    cy.get('[data-cy="onboarding-build-purpose"]').type('Testing ToolJet');
    cy.get('[data-cy="onboarding-submit"]').click();
    cy.get('[data-cy="onboarding-workspace-name"]').clear().type('Hapu Workspace'); //seems auto filled, rename
    cy.get('[data-cy="onboarding-submit"]').click();
    cy.get('.decline-button').click();
    cy.get('[data-cy="onboarding-submit"]').click();
  })

  it('Login & Logout',()=>{
    cy.visit('http://localhost:3080/login?redirectTo=/');
    cy.get('#email').type("user@abc.com" );
    cy.get('[data-cy="password-input"]').type("Pass123=");
    cy.get('.tj-base-btn').click();
    cy.url().should('include', '/test-companys-workspacetest-workspace');
    cy.log("Login successful");
    cy.log("Current URL:", cy.url());
    cy.log("Logout..");
    cy.visit('http://localhost:3080/test-companys-workspacetest-workspace')
    cy.get('[data-cy="settings-icon"]').click();
    cy.get('[data-cy="logout-link"]').click();
    cy.url().should('include', '/login');
  })
})
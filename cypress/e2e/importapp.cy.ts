describe('Import App via API', () => {
  let workspaceId = '';
  let token = '';

it('Authenticate via API and verify token', () => {
    cy.visit('http://localhost:3080/login?redirectTo=/');
    cy.request({
      method: 'POST',
      url: 'http://localhost:3080/api/authenticate',
      body: {
        email: 'user@abc.com',
        password: 'Pass123=',
        redirectTo: '/',
      },
    }).then((response) => {
      expect(response.status).to.eq(201);
      cy.log('object in res', JSON.stringify(response.body));
      cy.log('token:', JSON.stringify(response.headers['set-cookie'][0]));
    });
    cy.visit('http://localhost:3080/test-companys-workspacetest-workspace');
    cy.url().should('include', '/test-companys-workspacetest-workspace');
  });
});
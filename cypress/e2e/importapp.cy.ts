describe("Import App via API", () => {
	let workspaceId = "";
	let token = "";

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
			cy.log("token:", response.headers["set-cookie"][0].split(";")[0].split("=")[1]);
      token = response.headers["set-cookie"][0].split(";")[0].split("=")[1];
		});
		cy.visit("http://localhost:3080/hapu-workspace");
		cy.url().should("include", "/hapu-workspace");
    
	});
});

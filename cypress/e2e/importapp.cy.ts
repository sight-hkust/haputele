describe("Import App via API", () => {
	let workspaceId = "";
  let slug=""
	let token = "";
  let user="";

	it("Authenticate via API and verify token", () => {
		// cy.visit("http://localhost:3080/login?redirectTo=/");
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
      token = response.headers["set-cookie"][0].split(";")[0].split("=")[1];
      workspaceId = response.body["current_organization_id"]
      slug=response.body["current_organization_slug"]
      user=response.body["id"]
      cy.log(`token:${token}\n;wid:${workspaceId}\n;slug:${slug}\n;user:${user}`)

		});
		cy.visit("http://localhost:3080/hapu-workspace");
		cy.url().should("include", "/hapu-workspace");

    
    cy.log("get some sessions")
    // cy.request({
    //   method:"GET",
    //   url:"http://localhost:3080/api/session?appId&workspaceSlug=hapy-workspace",
    // }).then((res)=>{
    //   cy.log('res',res.body);
    // })
    // cy.on("uncaught:exception", (err, runnable) => {
    //   return false;
    // });

    // cy.log("how")
    //    cy.request({
    //   method:"GET",
    //   url:"http://localhost:3080/api/organizations?status=active",
    // }).then((res)=>{
    //   cy.log('res',res.body);
    // })
    // cy.on("uncaught:exception", (err, runnable) => {
    //   return false;
    // }); 
	});


});

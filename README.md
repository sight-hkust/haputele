# haputele

A project for end-to-end testing and automation of ToolJet applications using Cypress.


## Setup & Commands

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sight-hkust/haputele.git
   cd haputele
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   
3. **Run tests (customize as needed):**
    ```bash
    npx cypress open
    # or for headless
    npx cypress run 
    ```
## Test Cases

Test cases are written in Cypress and located in `cypress/e2e/`:

### 1. Onboarding (`01_onboarding.cy.ts`)
- **Sign up:** Automates user registration, onboarding steps, and workspace setup.
- **Login & Logout:** Automates login, verifies workspace access, and logs out.

### 2. Import App via API (`02_importapp.cy.ts`)
- **Authenticate:** Logs in via API and retrieves authentication tokens.
- **Import App:** Uses the `/api/v2/resources/import` endpoint to import an app using data from `cypress/fixtures/app.json`.
- **Verification:** Visits the workspace and checks that the imported app appears.


## Fixtures

- `cypress/fixtures/app.json`: App definition used for import tests.


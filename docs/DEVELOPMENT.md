# HapuTele Development & Contribution Guidelines

This guide establishes a coherent, professional workflow for all developers contributing to HapuTele. Adhering to these standards ensures code quality, clear tracking, and smooth deployment.

---

## 1. Issue Management Workflow

Every change in the codebase must correspond to an open GitHub issue.

```
[GitHub Issue] ➔ [Create Local Branch] ➔ [Implement & Test] ➔ [Create PR] ➔ [Review & Merge]
```

1. **Assign the Issue**: Before starting work, assign yourself the target issue on GitHub and update its status on the project board to **In Progress**.
2. **Branch Naming**: Branch off the latest `main` branch. Use a consistent naming convention:
   * **Bugs**: `bugfix/issue-<number>-<short-description>` (e.g., `bugfix/issue-45-trim-whitespace`)
   * **Features**: `feature/issue-<number>-<short-description>` (e.g., `feature/issue-85-doctor-agreement`)
   * **Tasks / Research**: `task/issue-<number>-<short-description>` (e.g., `task/issue-95-codebase-audit`)

---

## 2. Coding & Implementation Best Practices

1. **Test-Driven Development (TDD)**:
   * Whenever fixing a bug or adding a feature, write a test first (in `backend/tests/` for Python, or frontend unit tests if applicable).
   * Run the test to ensure it fails as expected, then implement the minimal code required to pass the test.
2. **Local Pre-flight Checks**:
   * Before committing, verify the entire test suite passes locally.
   * Run code formatting and linting tools.
   * Ensure the project builds successfully (`docker compose build` or local frontend build) without errors.
3. **Secrets Management**:
   * **Never hardcode secrets** (JWT secrets, DB passwords, S3 credentials) in the codebase.
   * Add configuration values to `.env.example` or `config.yaml.example` and load them via `app/config.py`.

---

## 3. Commit Message Standards (Conventional Commits)

We use the [Conventional Commits](https://www.conventionalcommits.org/) specification. This keeps the git history searchable and enables automated changelogs.

Format: `<type>(<scope>): <description>`

### Allowed Types:
* `feat`: A new feature (e.g., `feat(auth): add password confirmation field`)
* `fix`: A bug fix (e.g., `fix(ui): prevent modal close on outside click`)
* `docs`: Documentation changes only (e.g., `docs: update development guidelines`)
* `style`: Styling changes that do not affect code logic (whitespace, formatting, semi-colons)
* `refactor`: Code changes that neither fix a bug nor add a feature (e.g., `refactor(db): clean up timezone helper`)
* `test`: Adding missing tests or correcting existing tests
* `chore`: Updating build tasks, dependencies, or configuration (e.g., `chore: bump node version`)

---

## 4. Pull Request (PR) & Review Process

All code changes must go through a Pull Request before merging into `main`.

1. **Link the Issue**: Always link the issue in the PR description. Use keywords so GitHub automatically closes it upon merge:
   ```markdown
   Closes #45
   ```
2. **PR Description Checklist**:
   * **Objective**: A brief summary of what this PR changes.
   * **How to Test**: Step-by-step instructions for reviewers to verify the changes locally.
   * **Visuals (If applicable)**: Attach screenshots or screen recordings showing UI/UX changes (especially important for responsiveness/layout changes).
3. **Review & Merge**:
   * PRs require at least one approved code review from a teammate.
   * Ensure all CI workflows/tests pass successfully.
   * Use **Squash and Merge** when merging to keep the `main` branch history clean.

---

## 5. API Contract Sync (OpenAPI → Kubb)

Backend Pydantic models are the single source of truth for the wire contract.
Kubb generates models, typed Fetch clients, and TanStack Query factories under
`frontend/src/gen`; `frontend/src/types/api.ts` keeps stable application-facing
names and the few response-presence refinements the OpenAPI schema cannot carry.

**When a backend PR adds or changes an endpoint schema:**

1. Declare every JSON response as a Pydantic model (`response_model=`), never
   a bare `dict`. Declare binary response media types explicitly.
2. Regenerate the frontend API layer with one command — it exports the spec
   from the backend app, then runs Kubb:
   ```bash
   cd frontend && npm run generate:api
   ```
3. If a backend model is renamed, update its stable alias in
   `frontend/src/types/api.ts`.
4. Commit `frontend/src/gen` in the same PR as the backend change.
5. CI enforces the sync (`api-types-drift` job, same script as above):
   * **Pull requests / tags**: a diff fails the run, so stale generated code
     can never merge or ship silently.
   * **Pushes to `main`**: the job self-heals by opening an automated
     "regenerate API client" PR carrying only the fresh `frontend/src/gen`
     output — merge it promptly so the committed client matches the deployed
     backend. Image publication waits on this job either way.

---

## 6. Release Versioning

Release tags use the hybrid CalVer/SemVer format `vYYMM.MINOR.PATCH`:

* `YYMM` identifies the release year and month.
* `MINOR` increments for feature releases within that month.
* `PATCH` increments for fixes to that minor release.
* `MINOR` and `PATCH` reset to `0` when `YYMM` changes.

For example, `v2608.0.0` is the first August 2026 release, `v2608.1.0` is a later feature release that month, and `v2608.1.1` is its first patch.

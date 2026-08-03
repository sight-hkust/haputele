# HapuTele Development & Contribution Guidelines

This guide establishes a coherent, professional workflow for all developers contributing to HapuTele. Adhering to these standards ensures code quality, clear tracking, and smooth deployment.

---

## 1. Start the Project Locally

The supported local startup path is Docker Compose. Follow the [Local quick start](../README.md#local-quick-start-docker-compose) to build the stack, complete the first-run wizard, and verify the API health endpoint.

The short version, from the repository root:

```bash
docker compose up --build -d
docker compose ps
docker compose exec api cat /data/setup-token
```

Then open <http://localhost:3000> and complete the setup wizard. An `.env` file is optional; if you create one from `.env.example`, keep `NEXT_PUBLIC_API_URL` empty for the standard same-origin Compose setup.

Application containers contain production-style builds rather than live-mounted source files. Rebuild the affected service after making changes:

```bash
docker compose up --build -d api       # backend changes
docker compose up --build -d frontend  # frontend changes
```

Before opening a pull request, confirm that Compose still resolves and both application images build:

```bash
docker compose config --quiet
docker compose build api frontend
```

---

## 2. Issue Management Workflow

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

## 3. Coding & Implementation Best Practices

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

## 4. Commit Message Standards (Conventional Commits)

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

## 5. Pull Request (PR) & Review Process

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

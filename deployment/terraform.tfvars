# Pinned production image versions — the source of truth for what runs in prod.
#
#   Release:  bump the tag here, open a PR, merge, then run the Deployment
#             workflow (intent=apply). The running version is recorded in git.
#   Rollback: `git revert` this change (or use the deploy workflow's `image_tag`
#             input for an immediate, commit-free rollback).
#
# Terraform auto-loads terraform.tfvars, overriding the variable defaults. Always
# pin an IMMUTABLE tag here — a semver release (:0.1.0) or a commit (:sha-abc1234).
# Never :latest: it defeats reproducibility, and `terraform plan` can't show a diff
# when its contents change out from under you.
#
# NOTE: the referenced tag must already exist in GHCR before you apply, or the
# Ansible `docker compose pull` step fails. For a new semver, push the git tag and
# wait for the "Build Docker images" workflow to go green first.
docker_image_backend  = "ghcr.io/sight-hkust/haputele-backend:0.7.0"
docker_image_frontend = "ghcr.io/sight-hkust/haputele-frontend:0.7.0"

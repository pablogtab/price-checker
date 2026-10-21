---
name: deploy-gevafit
description: Deploy GevaFit (price-checker) to its Contabo server and verify the published app. Use when asked to deploy GevaFit, publish this project's changes, or check a GevaFit deployment.
---

# Deploy GevaFit

Publish the requested changes while preserving production business data. This skill
is specific to `pablogtab/price-checker`; it does not authorize a deployment by
itself or apply to other projects on the same server.

## Load the runbook

Find the current checkout with `git rev-parse --show-toplevel` and confirm its remote
is `pablogtab/price-checker`. Read `AGENTS.md` and `deploy/README.md` from that root.
The runbook is the source of truth for the target, transfer command, protected data,
no-backup decision, deployment entrypoint and completion criteria. Read the actual
Compose file, Dockerfiles and deployment script where the runbook directs.

If the checkout or runbook is missing, resolve that location before proceeding.
Keep host details and credentials out of this skill so they have one maintained home.

## Follow the requested branch

- **Deploy:** with the user's deployment request, follow the runbook through local
  checks, remote inspection, source transfer, deployment and public verification.
  Existing authorization covers its routine steps; ask only about unresolved scope,
  missing access or repairs beyond that authorization.
- **Verify:** perform the runbook's read-only production checks. Report the observed
  version, migration and workflow evidence without transferring files or restarting
  services unless the user also requested an update or repair.
- **Document or configure:** edit the procedure or skill locally. This branch does
  not publish the app or change production.

Report the public link, checks completed and any unresolved limitation. Build success,
healthy containers and public workflow verification are separate evidence; claim
completion only to the extent demonstrated.

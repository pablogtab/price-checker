# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `pablogtab/price-checker`.
Use the `gh` CLI with `--repo pablogtab/price-checker`.

## Conventions

- Publish a ticket or spec: create a GitHub issue.
- Fetch a ticket: read its body, labels and comments.
- List work: list issues with the appropriate state and label filters.
- Use `--body-file` for multiline issue descriptions and comments.
- Use GitHub sub-issues for parent/child relationships when supported.
  Otherwise, add `Part of #<parent>` to the child and link it in the parent.
- Use native issue dependencies for blockers when supported.
  Otherwise, record `Blocked by: #<number>` in the issue body.
- Apply the labels defined in `docs/agents/triage-labels.md`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding

- The map is an issue labelled `wayfinder:map`.
- Child tickets use `wayfinder:<type>`:
  research, prototype, grilling or task.
- Keep decisions and links in the map.
- Claim a ready, unblocked ticket by assigning it to the driving developer.
- Record the result before closing the ticket.

# Project Standing Rules

These rules apply to every implementation request in this project, including the Faculty Appointments work already completed, unless the user explicitly approves an exception.

1. **Inspect before changing.** Inspect the relevant implementation, dependencies, data flow, and permissions before modifying anything. Do not assume project structure or invent APIs.

2. **Preserve existing behavior.** Do not remove, replace, disable, or break existing features, business rules, routes/navigation, API contracts, authentication/authorization, validation, persistence, or completed UI states and interactions. A visual request is not permission to rewrite underlying logic.

3. **Make minimal, additive changes.** Reuse existing components, utilities, services, and conventions. Prefer extending working functionality over rewriting it. Do not perform unrelated refactors, rename existing interfaces, replace frameworks, upgrade dependencies, or change configuration without approval. Small integration edits are allowed when they preserve existing behavior and compatibility. Additive does not mean duplicate or disconnected systems.

4. **Ask before breaking or high-risk changes.** Stop and explain impact before breaking API/interface changes, destructive database changes or migrations, changes to business rules or permissions, broad architectural rewrites, or removal/replacement of working functionality. If a request conflicts with these rules, identify the conflict and request approval instead of silently overriding them.

5. **Make features actually work.** Connect controls to real application state and existing services. Implement validation, permissions, loading, success, failure, and empty states where relevant. Do not leave decorative controls, fake success messages, disconnected forms, or hardcoded production counts. Do not silently substitute mock data for real integration. Explain missing backend capabilities. Any temporary fixture must be clearly isolated to development or testing.

6. **Protect data and security.** Preserve existing records and user-entered information. Enforce authorization on the server as well as in the interface. Never expose secrets or private information. Prevent duplicate submissions and handle failures without losing valid input.

7. **Work in small, reviewable steps.** Implement only the current prompt's scope. Preserve earlier work. Do not begin later stages or add unrelated features automatically. Before editing, briefly state what will be added, which existing areas need integration changes, and any material risks or missing requirements.

8. **Verify new and existing functionality.** Add or update relevant tests. Run available lint, type checks, and targeted tests. Test affected existing workflows for regressions. If a check cannot be run, state that clearly. Do not claim something works or that tests passed without evidence. Distinguish pre-existing failures from failures introduced by the change.

9. **Report the outcome.** After each task, summarize features added, existing areas modified and why, checks performed and actual results, and remaining limitations or integration blockers. Do not claim "nothing was affected" without supporting evidence.

10. **Keep these rules active.** Follow these rules throughout this conversation and all subsequent project stages. These rules are saved in the repository root AGENTS.md. Do not create or edit other instruction files.


## SchedWise-specific rules

11. **Faculty scope only.** Do not change Student or Admin UI or behavior. If a shared file (for example frontend/src/shared/ui.tsx or index.css) must change, make it opt-in (a new prop, variant or scoped class) so Student and Admin render exactly as before. Do not edit frontend/src/features/student or frontend/src/features/admin.
12. **Backend is off limits unless the prompt names the files.** Do not edit backend/ or tools/ for UI tasks. Approved exception already in place: the read-only GET /appointments/index.php?id= endpoint. Do not add database changes or dependencies without approval.
13. **Never run tests that can send email or create accounts.** Do not run tools/run-tests.ps1, npm run test:browser, or the full API suite; the local SMTP configuration may be real. Allowed: `npx tsc --noEmit`, `npm run build`, `php -l`, `node --test tests/audit-transaction.test.mjs tests/csrf-client.test.mjs`, and pure unit tests that need no database or email.
14. **Secrets.** Never print or quote anything from backend/config.php, frontend/.env or environment variables.
15. **File hygiene.** Edit existing files in place. Do not create, rename, move or delete files unless the prompt says so. No scratch files (*_temp.txt, test.txt, tscerr.txt, tscout.txt, *.new.tsx); use the system temp folder for temporary output.
16. **Git.** Do not commit, push, or use `git add -A`. Show `git status` and `git diff --stat` at the end.
17. **Scope of reading.** Read only the files named in the prompt and what they import. Do not spawn subagents or run repo-wide sweeps.
18. **Design.** Use the tokens in frontend/src/index.css (no hard-coded hex). Spacing 4/8/12/16/20/24/32/40px, minimum text size 12px, body 14px. Nothing may overlap, clip or overflow horizontally at 1920, 1440, 1366, 1024 and 375px widths.
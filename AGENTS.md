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

10. **Keep these rules active.** Follow these rules throughout this conversation and all subsequent project stages. If persistent project instructions are supported, save them in the appropriate instructions document without overwriting existing guidance and report where they were saved. If persistence is unavailable, say so and note that the rules may need to be provided again in a new session.

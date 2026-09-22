---
name: land
description: >-
  Land requested changes for valtism/harmonies-do directly on origin/main.
  Invoke only when the user has explicitly requested landing, not merely for
  review, preparation, verification, or skill installation.
metadata:
  delta-action: land
---

# Land changes

Use this workflow only for `valtism/harmonies-do`. A direct invocation of this
skill, including `/land` or the Land Changes action, is authorization to carry
out the landing request. Do not ask the user to confirm the merge again.

## Repository policy

- The destination is the GitHub repository `valtism/harmonies-do`, remote
  `origin`, branch `main`.
- The established workflow is a direct, non-force push to `main`. At setup
  time, the repository had no pull request history, branch protection,
  rulesets, GitHub Actions workflows, or required remote checks. Verify those
  destination conditions at execution time; do not bypass a newly introduced
  policy.
- Follow the repository instructions in
  [`AGENTS.md`](../../../AGENTS.md). The verified local checks are
  `bun run lint` and `bun run build`, as defined in
  [`package.json`](../../../package.json). There is currently no test script.
- Use `origin` for GitHub publication, never the Delta-only `local` remote.
- Resolve rebase conflicts automatically when the intended result is clear.
  Preserve unrelated work. Stop and ask the user only when a resolution is
  ambiguous or unsafe.

## Workflow

1. Inspect `git status`, the complete working-tree diff, the current branch,
   remotes, and commits relative to `origin/main`. Determine exactly which
   changes belong to the landing request. Never discard, overwrite, stage, or
   commit unrelated work. If scope cannot be determined safely, stop and ask
   one focused question.

2. Confirm `origin` resolves to `https://github.com/valtism/harmonies-do.git`
   (or the equivalent SSH URL), GitHub's default branch is `main`, direct
   pushes remain allowed, and no branch protection, ruleset, review
   requirement, or required check has been added. Use authenticated, read-only
   `gh repo view` and `gh api` queries as needed. If policy now requires a
   different landing mechanism, report the blocker rather than bypassing it.

3. Stage only the requested paths explicitly. Review `git diff --cached` and
   ensure it contains the complete requested change and no unrelated edits.
   Keep independently meaningful requested changes in separate commits when
   that improves reviewability, including the landing skill itself when it is
   being landed alongside an earlier product change.

4. Run both required checks from the repository root:

   ```sh
   bun run lint
   bun run build
   ```

   These invocations are defined by the `lint` and `build` scripts in
   [`package.json`](../../../package.json). Do not land if either fails. There
   is no test command unless the manifest has changed; if it has, inspect the
   new script and run the applicable tests as well.

5. Create concise, non-interactive commits for the staged changes. Do not amend
   or rewrite existing shared commits. Fetch `origin/main`, then rebase the new
   local commits onto it. Set `GIT_EDITOR=true` for any rebase continuation
   that could otherwise open an editor.

6. During rebase conflicts, resolve automatically only where the requested
   outcome and preservation of upstream changes are clear. Inspect the
   resulting diff for dropped or duplicated behavior. If intent is ambiguous,
   abort the rebase to restore the pre-rebase state, report that the changes
   have not landed, and ask the user for the needed decision.

7. After the final rebase, rerun every required local check against the exact
   commits to be published. If repository policy now defines remote required
   checks, ensure all of them have completed successfully for those exact
   commits before landing; pending, failing, missing, or unverifiable checks
   are not success.

8. Push with an explicit non-force destination:

   ```sh
   git push origin HEAD:main
   ```

   If the push is rejected because `main` advanced, fetch, rebase, resolve
   clear conflicts under the policy above, rerun the required checks, and
   retry. Never force-push `main`.

9. Verify that `refs/heads/main` on `origin` exactly matches the final local
   `HEAD`, and verify the commit is visible in `valtism/harmonies-do` on
   GitHub. A prepared commit, successful local build, or topic-branch push is
   not a successful landing.

## Outcome reporting

When running in a subthread and `report_subthread_status` is available, report
the final result to the parent. Otherwise report it directly in the current
conversation.

- Use `status: "success"` only after the requested commits are verified on
  `origin/main`. Use a short title such as `Landed on main`; link the short
  commit SHA to its verified GitHub commit URL. Link a CI run only when one
  actually exists for the landed commit.
- Use `status: "failure"` for failed checks, denied publication, an ambiguous
  conflict, or any other genuine blocker. State in one short line that the
  change was not landed, and link any verified commit or check URLs that
  exist.
- Keep the status title to a few sentence-case words and the description to one
  short line. Do not invent URLs. A failure report is not terminal: continue a
  safe recovery when permitted, and report the updated verified outcome.

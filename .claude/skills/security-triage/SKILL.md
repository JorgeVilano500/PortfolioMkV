---
name: security-triage
description: Rank up to 15 verified Medium, High or Critical security risks in this repo, separating code bugs from controls that aren't switched on and owner decisions, then fix them one at a time when asked. Run /security-triage, optionally with a focus area, or /security-triage fix <finding or S-ID> to work on one item.
argument-hint: "[focus area] | fix <finding or S-ID>"
disable-model-invocation: true
---

# Security triage

Find what is most worth fixing in this repository's security, rank it, and then help the owner work through it, one item at a time if they like. The owner runs this again and again, so each run should be quick to read and honest about what it couldn't check. It should also leave the repo so that the next run can see what has been done.

Arguments: "$ARGUMENTS"

- **Empty, or a focus area** (for example `APIs`, `auth`, `dependencies`, `the open SECURITY.md queue`): do a **review**, then offer the follow-ups. A focus narrows where you look, not the rules for what counts.
- **Starts with `fix`** (for example `fix S-40`, `fix the sponsorship email guards`): skip the full review and go straight to **Fixing** for that one item, after confirming it still applies.

## Review

The review is read-only. Don't change code or docs while reviewing, because the owner decides what happens next.

### What to read first
1. `AGENTS.md`, which is already loaded through `CLAUDE.md`, and `SECURITY.md`. In `SECURITY.md`, the parts that matter most are §3 (contributor rules), §4 (controls that must keep existing), §5 (endpoint matrix) and §7 (issue queue). Treat its statuses as leads, not proof. Confirm every candidate against the current code, config, tests and `package-lock.json`.
2. `git status` and `git log -1`, so the report can name the commit reviewed and any uncommitted changes.
3. If this conversation already holds a review of the same commit, don't repeat it. Say so, re-run the parts that can change without a commit (the dependency audit), and reuse the findings.

### Where to look
Cover the security-sensitive areas this project actually has:
- **Admin sign-in and sessions:** `lib/session.ts`, `lib/two-factor.ts`, `lib/admin-auth.ts`, `app/api/auth/route.ts`.
- **Every route handler:** `app/api/**/route.ts`, plus other handlers such as `app/laptop/stickers/[spot]/route.ts` and the OG images. Check auth, input validation, body caps, rate limits and error leakage.
- **Rate limits and lockouts:** `lib/rate-limit.ts`, `lib/auth-lockout.ts`. In-memory counters are per serverless instance.
- **Supabase:** RLS and grants in `supabase/*.sql`, the service-role boundary (`server-only`), and the private `sponsor-stickers` bucket.
- **Uploads and parsing:** file-type checks, pixel limits, stored-path rules, front matter.
- **Rendering:** `components/ui/MarkdownRenderer.tsx`, `lib/markdown-sanitize.ts`, `serializeJsonLd`, and any `dangerouslySetInnerHTML`.
- **Email to typed addresses:** `/api/sponsorships`, `lib/sponsor-email.ts`.
- **Consent and analytics:** `lib/consent.ts`, `/api/analytics/track`, `/api/consent`.
- **Headers and CSP:** `next.config.ts`.
- **Secrets:** tracked files only. Never open `.env*`. Check which names are `NEXT_PUBLIC_`.
- **Dependencies:** run `npm audit --omit=dev` and `npm audit`. For any advisory, `npm ls <package> --omit=dev` shows whether it reaches production.
- **Deployment-dependent controls:** features that depend on env vars (`ADMIN_2FA`, the Turnstile keys, `SESSION_SECRET`), and SQL files the owner may not have run yet.

Re-check every item in SECURITY.md §7 that isn't marked ✅. As of 2026-11-08 those are S-2, S-4, S-5, S-6, S-7, S-12, S-23, S-37 and S-40. Report an item only if it still applies.

### How to judge
Give each finding one of three kinds, because the owner acts on each kind differently:
- **Code:** a vulnerability confirmed in the repository's code. It can be fixed here.
- **Not switched on:** a control that exists in code but isn't enabled in deployment, or can't be confirmed as enabled (an env var, a SQL file).
- **Owner decision:** an operational or product choice, such as data retention, secret rotation or repo visibility.

Rank by severity first, then by confidence and practical exposure. Report at most 15 findings, and only Medium, High or Critical ones. Don't invent, split or downgrade findings to reach a number. If fewer qualify, report fewer. If none qualify, say so plainly and list the remaining deployment checks separately.

For each finding, have concise evidence:
- the file and lines
- the behaviour, or the missing control
- realistic preconditions
- the impact
- why existing mitigations do or don't cover it

Call something exploitable only when the repository's evidence shows it. Netlify, Supabase and Resend settings can't be seen from the repo, so mark anything that depends on them as **needs verification**.

Where you can, prove a validator gap by running it. Jest only finds tests inside the repo, so a throwaway `__tests__/zz-probe-*.test.ts` that imports the real function is allowed, with three conditions:
- it makes no network calls
- you delete it before you finish
- the report says you did

That is the one exception to the review being read-only.

### Report
Write for the owner, who knows the site well but isn't a security specialist. Use plain words and short sentences, and explain a term the first time it appears if it isn't everyday. Use this structure:

1. **Summary:** the number of findings by severity, the commit reviewed, and the important limits on what could be verified.
2. **Table**, ordered by severity, then confidence:

   | # | Severity | File | Lines | Vulnerability | Confidence |
   |---|----------|------|-------|---------------|------------|
   | 1 | 🟠 HIGH | [lib/admin-auth.ts](lib/admin-auth.ts#L40-L58) | 40-58 | **Not switched on (S-6):** the specific issue and its impact | 7/10 |

   Use only 🔴 CRITICAL, 🟠 HIGH and 🟡 MEDIUM. Start each Vulnerability cell with the finding's kind, plus its SECURITY.md ID if it has one.
3. **Evidence:** a short entry per finding, numbered to match the table.
4. **Top priorities:** the best one to three things to tackle first, in order. Explain why that order, and name any owner action that has to come first, such as switching on a spam check before allowing email to reach strangers.
5. **Owner and deployment actions:** open items that can't be fixed in code, with their SECURITY.md IDs and the safest way for the owner to verify each one.
6. **Not counted:** brief notes on suspected issues that current controls rule out, and any Low items you saw but didn't report. Keep it short.

If there are findings, offer the follow-ups with AskUserQuestion:
- **Fix highest severity issues:** then list the top-ranked Code findings and ask which ones to fix.
- **Fix all issues:** minimal fixes for every Code finding, one at a time.
- **Commit a summary of findings:** write `SECURITY-REVIEW.md` and commit it. The repository is public (S-37), so this would publish unfixed findings. Say so in the option's description.

## Fixing

This section covers "Fix highest severity issues", "Fix all issues" and `/security-triage fix <item>`.

- **One finding at a time.** Then each change is small enough to review and revert on its own.
- **Check that it still applies.** It may have been fixed since it was reported. If it has, say so, and move on or stop.
- **Code changes only for Code findings.** For Not switched on and Owner decision items, don't touch external accounts or production. Write the owner's steps and the safest way to check them instead. A code change that makes the owner's step safer is still fair game, such as failing closed or logging a warning.
- **Branch.** If you're on `main`, create a branch first (for example `security/<short-name>`). Don't commit or push unless the owner asks.
- **Rules.** Follow AGENTS.md §4 for the code you touch. That covers the validation helpers, `readJsonBody`, `checkAdminAuth`, generic error responses and `server-only`, and reading the bundled Next.js 16 docs before you use a Next API.
- **Smallest change, plus a test.** Make the smallest change that closes the risk, and add or update a test that would have failed before the fix (see TESTING.md).
- **Checks.** Run `npm test`, `npx tsc --noEmit` and `npm run lint`. For UI changes, also walk through the manual QA in TESTING.md §7. Never exercise `/api/sponsorships` or run a build with real keys (AGENTS.md §6).
- **Docs, in the same change (AGENTS.md §8):**
  - in SECURITY.md: the item's status in §7 (a new S-ID for a new finding), a §8 history line, and the date at the top
  - PRD.md's change log
  - the test counts in AGENTS.md §3 and TESTING.md §3, if they changed

  The SECURITY.md updates are how the next `/security-triage` run knows an item is done.
- **Report and continue.** After each fix, report what changed, the check results, and what's next. For "Fix highest severity issues", stop and ask before the next item. For "Fix all issues", carry on through the Code findings and report at the end.

## Commit a summary

Do this only when the owner picks it.
1. Write `SECURITY-REVIEW.md` with:
   - the date and commit
   - the summary
   - the table and the evidence
   - the actions
2. Leave out secrets, keys, real IP addresses, email addresses and visitor data.
3. Show the owner the file before committing.
4. Commit only that file, and don't push unless asked.

## Safety and scope

These hold in every mode:
- Review only this checked-out repository and systems the owner has explicitly authorized. Keep the work defensive and evidence-based.
- Don't attack, scan, fuzz or send crafted requests to the production site or any third party. Don't use real credentials, send email, upload files, read or change production data, run migrations or DDL, or change external account settings.
- Prefer static review and the existing tests. Dependency audit commands are fine. Report their results with their scope (production or development).
- Never open `.env*` files. Don't print, copy or include secrets or visitor data in findings. When an env var matters, give its name, never its value.

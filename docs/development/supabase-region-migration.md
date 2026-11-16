# Move Recipe Box to a Supabase region closer to its users

This runbook covers moving the production Recipe Box Supabase project to a new
project in a western US region, then placing the Vercel Function in the same
region. A Supabase project's region cannot be changed in place; this is a
project migration, not a settings toggle.

For users in the Pacific Northwest, Supabase currently lists **West US
(Oregon), `us-west-2`**. Vercel's Portland region is **`pdx1`**. Confirm that
both regions are available to the accounts and plans in use before scheduling
the move:

- [Supabase available regions](https://supabase.com/docs/guides/platform/regions)
- [Vercel Function regions](https://vercel.com/docs/functions/configuring-functions/region)

The steps below use Supabase's documented CLI logical backup/restore. They
require a maintenance window: a final database dump and Storage copy are not a
live replication stream. Do not let users write to the source during the final
copy and cutover.

## What this migration does and does not move

- The database dump/restore carries PostgreSQL schema and data. It is the
  project-level route; Recipe Box's **Database Export** ZIP is only a
  supplementary account-data backup. The ZIP does not include Auth users,
  credentials, or change history. See the
  [portable bundle contract](../plans/import-export-format.md) and
  [recovery boundaries](../plans/comprehensive-reference/07-import-export-and-history.md#116-recovery-and-reset-boundaries).
- Storage object bytes live outside PostgreSQL. Copy them separately, in
  addition to restoring bucket metadata and policies. At minimum, this app
  uses the private `recipe-media` and `recipe-exports` buckets; check the
  source project for any others.
- Supabase project settings are not database objects. Recreate Auth provider,
  email/SMTP, URL/redirect, API, webhook, and other service settings on the new
  project. Do not expect project API keys, active sessions, or provider
  configuration to move with the SQL dump.
- Recipe Box has custom database objects attached to managed schemas. For
  example, its migrations create an `auth.users` trigger that creates an
  account row and add policies and bucket configuration for `storage`. Verify
  these customizations explicitly; Supabase's CLI backup guide explains that
  custom changes to `auth` and `storage` need separate handling.
- Supabase Realtime publications, if used, must be re-enabled on the target.

Keep the old project and its backups intact until the new deployment has been
validated and the rollback window has ended.

## 1. Rehearse before choosing a cutover date

1. Choose a low-traffic window and estimate the duration by rehearsing the
   database restore and Storage copy into a disposable project in the intended
   region. Do not use a production reset command or experiment on either
   hosted project.
2. Record the source project's database version, enabled extensions, database
   webhooks, Auth providers/settings, redirect allow list, email templates and
   SMTP settings, Realtime publications, Storage buckets and policies, and
   any other enabled Supabase services.
3. Check that the source project has a recent recoverable backup. Also make a
   fresh Recipe Box Database Export ZIP for each account as an additional
   recovery option, not as the main project migration.
4. Review the current migration files in `supabase/migrations/` and identify
   the customizations to managed schemas. In particular, verify the account
   creation trigger and `storage.objects` policies on the source and target.
   The new project must have the database objects expected by the app before
   it is exposed to users.
5. Test the complete process with representative data, including an existing
   email/password login, each configured OAuth provider, an invitation, a
   password reset, a private recipe photo, a publication cover, and a public
   recipe link. Check that record and object counts match before accepting the
   rehearsal.

Do not proceed if the restore has errors, record counts differ, required
customizations are missing, or a test account cannot sign in.

## 2. Create and configure the Oregon project

1. Create a new Supabase project and select **West US (Oregon) (`us-west-2`)**
   if it is offered. Use a strong, unique database password and store it in a
   password manager.
2. Match the source project's Postgres major version where the platform allows
   it. Enable the source's non-default extensions and Database Webhooks, if
   any, before restoring.
3. Configure the target's Auth settings: site URL, allowed redirect URLs for
   the production domain, sign-up policy, providers and provider credentials,
   email templates, and SMTP. The production app origin remains the same, but
   update the Supabase callback URL in each OAuth provider if the target
   project's callback URL differs.
4. Do not point Vercel at this project yet. Record its project URL, database
   connection string, publishable key, Secret key, and project reference. Keep
   all credentials outside source control.

## 3. Back up and restore PostgreSQL

Use the [Supabase CLI backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
for current CLI requirements and troubleshooting. Install the CLI version
appropriate for the installed project tooling, Docker, and `psql`. Get the
source and target connection strings from each project's **Connect** panel;
use the direct connection or the documented session-pooler alternative for
your network.

Run the following from a private, encrypted working directory outside the
repository. The dump files contain private application data. Enter connection
strings at hidden prompts rather than putting passwords in shell history,
committed files, or chat:

```sh
read -rsp "Source database URL: " OLD_DB_URL
printf '\n'
read -rsp "Target database URL: " NEW_DB_URL
printf '\n'
export OLD_DB_URL NEW_DB_URL

supabase db dump --remote="$OLD_DB_URL" -f roles.sql --role-only
supabase db dump --remote="$OLD_DB_URL" -f schema.sql
supabase db dump --remote="$OLD_DB_URL" -f data.sql \
  --use-copy --data-only \
  -x "storage.buckets_vectors" \
  -x "storage.vector_indexes"

psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$NEW_DB_URL"
```

The restore is transactional: on an error, stop and investigate rather than
continuing with a partially restored project. Follow the Supabase guide if
restore permissions require omitting documented `supabase_admin` ownership or
`cli_login_postgres` grant lines; do not make unrelated edits to the dump.

If Supabase Vault or `pgsodium`/column encryption is used, stop before pausing
or deleting the source. Follow the linked guide to retrieve and copy the
source's encryption root key to the target; without the same key, encrypted
data cannot be decrypted. Preserve the source project's key securely.

If the source used Supabase CLI migrations, preserve the
`supabase_migrations` history using the separate history dump and restore
commands in the Supabase guide. Do not run all repository migrations over the
restored schema; that can duplicate objects. Compare the restored schema and
migration history with `supabase/migrations/` and resolve any differences
deliberately.

### Restore app customizations to managed schemas

Supabase's dump process does not automatically reproduce every project-specific
change to managed schemas. Use the Supabase guide's `supabase db diff` process
for the project's configured diff engine, and compare the result with this
repository's migration history. Apply and verify any missing app-owned
customizations on the target, especially:

- the `auth.users` trigger and its `public.create_account_for_auth_user()`
  function;
- the `recipe-media` and `recipe-exports` bucket definitions, privacy and size
  limits; and
- the `storage.objects` policies for private account-owned media.

Do not recreate Supabase's platform-owned Auth or Storage objects. If the
source has custom Auth or Storage changes that are not represented in this
repository, stop and account for them before proceeding.

If Realtime was in use, re-enable the required table publications on the target
in **Database > Publications**.

## 4. Copy Storage objects

Use Supabase's [Storage migration instructions](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
to copy the object bytes between the source and target projects. The linked
guide provides a Storage API script that recreates bucket settings and copies
files; inspect and run it from a private working directory. Supply the source
and target project URLs and server-side Secret/service-role keys only through
local environment variables or another secure mechanism. Never paste these
keys into source files, Vercel's browser-exposed variables, or chat.

Require the script to finish with zero failed files. Compare source and target
bucket names, file counts, and representative object paths. Open several
existing recipe photos and publication covers through the target app before
cutover. The database references and object paths must agree.

## 5. Validate the target before cutover

Keep production pointed at the source while validating the target. Confirm:

- database table and Auth user counts match the source, including account rows
  tied to Auth user IDs;
- a migrated email/password user can sign in with the existing password, and
  configured OAuth sign-in, invitation, and password recovery work;
- the account-creation trigger creates an account for a test Auth user;
- all expected bucket policies are present and private media is not publicly
  readable;
- representative recipes, publication covers, recipe photos, and public
  `/r/` links work; and
- a small, reversible write (for example, editing a test recipe and uploading
  a test photo) succeeds, then can be removed.

Test Auth and Storage behavior using the application's supported flows; do not
edit or delete production users or records just to test the target.

## 6. Freeze writes and make the final copy

1. Announce a maintenance window and stop app writes before the final backup.
   Recipe Box does not currently have an application-level maintenance switch:
   a user announcement alone is not a technical write freeze. Use a suitable
   Vercel access restriction or maintenance deployment, and verify users cannot
   continue writing to the source.
2. Confirm that there are no in-flight imports, exports, uploads, invitations,
   or administrative changes. Keep the source project available but
   write-disabled.
3. Repeat the PostgreSQL dump/restore and Storage copy from the now-frozen
   source to a clean target, or otherwise ensure the target contains every
   final source change without overwriting conflicting data. Use the same
   error checks and count comparisons as the rehearsal.
4. Recheck Auth/Storage customizations and run the short target validation
   checklist above. Keep the site in maintenance until the target is selected
   in Vercel.

If a complete final copy will take too long for the available outage, stop and
plan a different migration strategy before the maintenance window. The
documented logical backup/restore is not continuous replication.

## 7. Point Vercel to the new project

1. In Vercel, update the **Production** environment variables to the target
   project's URL, publishable key, and Secret key:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY`. Keep the existing `NEXT_PUBLIC_SITE_URL`,
   `SIGNUP_MODE`, and `CRON_SECRET` unless their intended values changed.
   See the [hosted deployment environment-variable instructions](../../README.md#5-add-production-environment-variables-and-deploy).
2. Set the Vercel Function region to Portland, **`pdx1`**, in the project's
   function-region settings (or configure `regions` as documented for the
   deployed Next.js functions). Keep it colocated with the Oregon Supabase
   project.
3. Redeploy Production so the new environment variables are used. Do not
   change the production Auth site URL or application domain unless the
   domain itself is changing.
4. With the maintenance restriction still active, verify the production
   deployment is using the target URL and run a final sign-in, recipe read,
   image read, and controlled write check. Then remove the restriction and
   confirm normal access.

## 8. Rollback and cleanup

- If validation fails before reopening the site, keep writes frozen, restore
  Vercel's previous Supabase URL and keys, redeploy, and reopen the source
  project. Do not delete the target; preserve it for diagnosis.
- Once users have written to the target, switching back to the source would
  lose those target-side writes unless they are migrated back. Freeze writes
  again and decide how to reconcile them before rolling back.
- Keep the old Supabase project, its backups, and the encrypted dump files
  until the agreed rollback period has passed and the new project has been
  backed up and verified. Then remove sensitive local dump files using the
  secure storage provider's retention/deletion procedure.
- After cleanup, verify scheduled Vercel jobs and application monitoring
  against the new project. Keep the function and database in the same region
  when evaluating post-migration latency.

## References

- [Supabase: Available regions](https://supabase.com/docs/guides/platform/regions)
- [Supabase: Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase: Restore to a new project](https://supabase.com/docs/guides/platform/clone-project)
  (this preserves the source region and is not the cross-region route)
- [Vercel: Configuring Function regions](https://vercel.com/docs/functions/configuring-functions/region)

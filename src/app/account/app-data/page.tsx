import { redirect } from 'next/navigation';
import { isDatabaseExportReminderDue } from '../../../lib/exports/rules';
import { createClient } from '../../../lib/supabase/server';
import { ExportAction } from '../../export-action';
import { AccountContentResetAction } from '../../settings/account-content-reset-action';
import { DatabaseImportAction } from '../../settings/database-import-action';

const resetErrorCodes = ['google', 'provider', 'unavailable'];

export default async function AppDataPage({
  searchParams,
}: {
  searchParams: Promise<{
    content_reset_error?: string;
    content_reset_reauthenticated?: string;
  }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect('/');
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('last_database_export_at, sign_in_method')
    .eq('id', data.user.id)
    .maybeSingle();

  if (accountError || !account) {
    throw new Error('Unable to load App data.');
  }

  const resetError = resetErrorCodes.includes(query.content_reset_error ?? '')
    ? query.content_reset_error
    : undefined;

  return (
    <main aria-labelledby="page-title" className="settings-main settings-app-data">
      <h1 id="page-title">App data</h1>
      <section
        aria-labelledby="app-data-title"
        className="settings-section settings-data-management settings-app-data-section"
      >
        <div className="settings-data-management-heading">
          <h2 id="app-data-title">App data</h2>
          <p>
            {account.last_database_export_at
              ? `Last database export: ${new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(account.last_database_export_at))}`
              : 'No database export yet'}
          </p>
        </div>
        {isDatabaseExportReminderDue(account.last_database_export_at) && (
          <p className="settings-export-reminder" role="note">
            Make a database export now. Your backup reminder appears every 30 days.
          </p>
        )}
        <div className="settings-data-management-content">
          <div className="settings-data-management-transfers">
            <ExportAction
              buttonLabel="Export database"
              className="settings-app-data-export-action"
              scope={{ type: 'database' }}
            />
            <DatabaseImportAction />
          </div>
          <AccountContentResetAction
            initialOpen={query.content_reset_reauthenticated === '1' || Boolean(resetError)}
            initialReauthReady={query.content_reset_reauthenticated === '1'}
            provider={account.sign_in_method === 'google' ? 'google' : 'email_password'}
            redirectError={resetError}
          />
        </div>
      </section>
    </main>
  );
}

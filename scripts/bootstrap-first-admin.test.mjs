import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrapFirstAdmin } from './bootstrap-first-admin.mjs';

const bootstrapOptions = {
  email: ' Owner@Example.com ',
  serviceRoleKey: 'server-only-secret',
  siteUrl: 'https://recipes.example.com',
  supabaseUrl: 'https://project.supabase.co',
};

function createFakeSupabase({
  accountError = null,
  adminLookupError = null,
  admins = [],
  claimData = true,
  claimError = null,
  deleteError = null,
  inviteError = null,
  listUsersError = null,
  metadataError = null,
  users = [],
} = {}) {
  const calls = {
    accountUpdate: null,
    clientOptions: null,
    deletedUserIds: [],
    invite: null,
    listUsers: [],
    metadata: null,
    rpc: null,
  };

  const adminLookup = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async limit() {
      return { data: admins, error: adminLookupError };
    },
  };
  const accountUpdate = {
    update(values) {
      calls.accountUpdate = values;
      return this;
    },
    eq() {
      return this;
    },
    select() {
      return this;
    },
    async maybeSingle() {
      return { data: accountError ? null : { id: 'invited-user' }, error: accountError };
    },
  };

  let accountQueryCount = 0;
  const client = {
    from(table) {
      assert.equal(table, 'accounts');
      accountQueryCount += 1;
      return accountQueryCount === 1 ? adminLookup : accountUpdate;
    },
    auth: {
      admin: {
        async listUsers(options) {
          calls.listUsers.push(options);
          return { data: { users }, error: listUsersError };
        },
        async inviteUserByEmail(email, options) {
          calls.invite = { email, options };
          return {
            data: {
              user: {
                id: 'invited-user',
                app_metadata: { existing_claim: 'preserved' },
              },
            },
            error: inviteError,
          };
        },
        async updateUserById(userId, attributes) {
          calls.metadata = { userId, attributes };
          return { error: metadataError };
        },
        async deleteUser(userId) {
          calls.deletedUserIds.push(userId);
          return { error: deleteError };
        },
      },
    },
    async rpc(name, args) {
      calls.rpc = { name, args };
      return { data: claimData, error: claimError };
    },
  };

  return { calls, client };
}

function runBootstrap(fake, overrides = {}) {
  return bootstrapFirstAdmin({
    ...bootstrapOptions,
    ...overrides,
    createSupabaseClient: (...args) => {
      fake.calls.clientOptions = args;
      return fake.client;
    },
  });
}

test('sends one email/password invitation and claims the first administrator', async () => {
  const fake = createFakeSupabase();

  const result = await runBootstrap(fake);

  assert.equal(result.ok, true);
  assert.match(result.message, /owner@example\.com/);
  assert.deepEqual(fake.calls.clientOptions, [
    bootstrapOptions.supabaseUrl,
    bootstrapOptions.serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ]);
  assert.deepEqual(fake.calls.invite, {
    email: 'owner@example.com',
    options: { redirectTo: 'https://recipes.example.com/auth/confirm' },
  });
  assert.deepEqual(fake.calls.metadata, {
    userId: 'invited-user',
    attributes: {
      app_metadata: {
        existing_claim: 'preserved',
        invitation_pending: true,
        sign_in_method: 'email_password',
      },
    },
  });
  assert.deepEqual(fake.calls.accountUpdate, { sign_in_method: 'email_password' });
  assert.deepEqual(fake.calls.rpc, {
    name: 'claim_first_admin',
    args: { p_user_id: 'invited-user' },
  });
  assert.deepEqual(fake.calls.deletedUserIds, []);
});

test('refuses to send an invitation when an administrator already exists', async () => {
  const fake = createFakeSupabase({ admins: [{ id: 'existing-admin' }] });

  const result = await runBootstrap(fake);

  assert.equal(result.ok, false);
  assert.match(result.message, /can only run once/);
  assert.equal(fake.calls.listUsers.length, 0);
  assert.equal(fake.calls.invite, null);
});

test('refuses to invite an email that already has an Auth account', async () => {
  const fake = createFakeSupabase({ users: [{ email: 'OWNER@example.com' }] });

  const result = await runBootstrap(fake);

  assert.equal(result.ok, false);
  assert.match(result.message, /already has an account/);
  assert.equal(fake.calls.invite, null);
});

test('does not connect to Supabase when the configured site URL is not HTTPS', async () => {
  const fake = createFakeSupabase();

  const result = await runBootstrap(fake, { siteUrl: 'http://recipes.example.com' });

  assert.equal(result.ok, false);
  assert.match(result.message, /must use HTTPS/);
  assert.equal(fake.calls.clientOptions, null);
});

test('deletes the pending Auth user when invitation metadata cannot be prepared', async () => {
  const fake = createFakeSupabase({ metadataError: new Error('metadata update failed') });

  const result = await runBootstrap(fake);

  assert.equal(result.ok, false);
  assert.match(result.message, /No account was kept/);
  assert.deepEqual(fake.calls.deletedUserIds, ['invited-user']);
  assert.equal(fake.calls.rpc, null);
});

test('deletes the pending Auth user when its account row cannot be updated', async () => {
  const fake = createFakeSupabase({ accountError: new Error('account update failed') });

  const result = await runBootstrap(fake);

  assert.equal(result.ok, false);
  assert.match(result.message, /No account was kept/);
  assert.deepEqual(fake.calls.deletedUserIds, ['invited-user']);
  assert.equal(fake.calls.rpc, null);
});

test('deletes the pending Auth user when the first-administrator claim fails', async () => {
  const fake = createFakeSupabase({ claimData: false });

  const result = await runBootstrap(fake);

  assert.equal(result.ok, false);
  assert.match(result.message, /claim was unavailable/);
  assert.deepEqual(fake.calls.deletedUserIds, ['invited-user']);
});

test('reports when rollback of a failed bootstrap cannot be confirmed', async () => {
  const fake = createFakeSupabase({
    deleteError: new Error('delete failed'),
    metadataError: new Error('metadata update failed'),
  });

  const result = await runBootstrap(fake);

  assert.equal(result.ok, false);
  assert.match(result.message, /Cleanup could not be confirmed/);
});

begin;

set local search_path = extensions, public;

select plan(5);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'provider-guard-password@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'provider-guard-google@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

insert into auth.identities (provider_id, user_id, identity_data, provider)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '{"sub":"10000000-0000-4000-8000-000000000001","email":"provider-guard-password@example.test"}',
    'email'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '{"sub":"10000000-0000-4000-8000-000000000002","email":"provider-guard-google@example.test"}',
    'email'
  );

update public.accounts
set sign_in_method = 'google'
where id = '10000000-0000-4000-8000-000000000002';

select lives_ok(
  $$
    insert into auth.identities (provider_id, user_id, identity_data, provider)
    values (
      'google-provider-guard-test',
      '10000000-0000-4000-8000-000000000002',
      '{"sub":"google-provider-guard-test","email":"provider-guard-google@example.test"}',
      'google'
    )
  $$,
  'Google identity is accepted for a Google account'
);

select throws_ok(
  $$
    insert into auth.identities (provider_id, user_id, identity_data, provider)
    values (
      'google-provider-guard-conflict',
      '10000000-0000-4000-8000-000000000001',
      '{"sub":"google-provider-guard-conflict","email":"provider-guard-password@example.test"}',
      'google'
    )
  $$,
  'P0001',
  'This account uses email and password sign-in.',
  'Google identity is rejected for an email-and-password account'
);

select throws_ok(
  $$
    update public.accounts
    set sign_in_method = 'email_password'
    where id = '10000000-0000-4000-8000-000000000002'
  $$,
  'P0001',
  'A Google account cannot be changed to email and password sign-in.',
  'A linked Google account cannot be changed to email and password sign-in'
);

select is(
  public.claim_first_admin('10000000-0000-4000-8000-000000000002'),
  true,
  'The first accepted invitation can claim administrator status'
);

select is(
  public.claim_first_admin('10000000-0000-4000-8000-000000000001'),
  false,
  'A later invitation cannot claim first administrator status'
);

select * from finish();
rollback;
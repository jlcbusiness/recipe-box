begin;

set local role postgres;
set local search_path = extensions, public;

select plan(29);

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
    '28000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'admin-updates-admin@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '28000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'admin-updates-member@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

update public.accounts
set is_admin = true
where id = '28000000-0000-4000-8000-000000000001';

set local role anon;
select throws_ok(
  $$select id from public.app_updates$$,
  '42501',
  null,
  'anonymous users cannot read application updates'
);
select throws_ok(
  $$select public.admin_update_create('unauthorized', 'fix')$$,
  '42501',
  null,
  'anonymous users cannot create application updates'
);
select throws_ok(
  $$select id from public.admin_update_events$$,
  '42501',
  null,
  'anonymous users cannot read admin update history'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '28000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*)::integer from public.app_updates),
  0,
  'non-admin users cannot read application updates'
);
select throws_ok(
  $$select public.admin_update_create('unauthorized', 'fix')$$,
  '42501',
  null,
  'non-admin users cannot create application updates'
);
select is(
  (select count(*)::integer from public.admin_update_events),
  0,
  'non-admin users cannot read admin update history'
);

select set_config('request.jwt.claim.sub', '28000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.admin_update_create('Fix the first issue', 'fix')$$,
  'an admin can create an update'
);
select is(
  (select count(*)::integer from public.app_updates where body_markdown = 'Fix the first issue'),
  1,
  'created update is visible to admins'
);
select is(
  (select revision from public.app_updates where body_markdown = 'Fix the first issue'),
  1,
  'new update starts at revision one'
);
select is(
  (select count(*)::integer
   from public.admin_update_events
   where update_id = (select id from public.app_updates where body_markdown = 'Fix the first issue')
     and event_type = 'created'),
  1,
  'creation appends one audit event'
);
select is(
  (select actor_id from public.admin_update_events
   where update_id = (select id from public.app_updates where body_markdown = 'Fix the first issue')
   order by id limit 1),
  '28000000-0000-4000-8000-000000000001'::uuid,
  'audit event records the authenticated admin'
);
select throws_ok(
  $$select public.admin_update_create('Invalid type', 'tweak')$$,
  '22023',
  null,
  'database rejects unsupported classifications'
);
select throws_ok(
  $$select public.admin_update_create('   ', 'fix')$$,
  '22023',
  null,
  'database rejects blank update text'
);
select throws_ok(
  $$select public.admin_update_create(repeat('a', 5001), 'fix')$$,
  '22023',
  null,
  'database rejects update text over the length limit'
);
select lives_ok(
  $$select public.admin_update_update(
    (select id from public.app_updates where body_markdown = 'Fix the first issue'),
    1,
    'Fix the first issue more clearly',
    'feature'
  )$$,
  'an admin can edit content and classification'
);
select is(
  (select revision from public.app_updates where body_markdown = 'Fix the first issue more clearly'),
  2,
  'successful edit increments revision'
);
select throws_ok(
  $$select public.admin_update_update(
    (select id from public.app_updates where body_markdown = 'Fix the first issue more clearly'),
    1,
    'Stale content',
    'fix'
  )$$,
  'PT409',
  null,
  'stale revisions conflict instead of overwriting newer edits'
);
select throws_ok(
  $$select public.admin_update_set_completion(
    (select id from public.app_updates where body_markdown = 'Fix the first issue more clearly'),
    2,
    '01.2.3'
  )$$,
  '22023',
  null,
  'database rejects non-semver versions'
);
select lives_ok(
  $$select public.admin_update_set_completion(
    (select id from public.app_updates where body_markdown = 'Fix the first issue more clearly'),
    2,
    '1.10.0'
  )$$,
  'an admin can mark an update complete'
);
select is(
  (select completed_version from public.app_updates where body_markdown = 'Fix the first issue more clearly'),
  '1.10.0',
  'completed version is stored'
);
select lives_ok(
  $$select public.admin_update_set_completion(
    (select id from public.app_updates where body_markdown = 'Fix the first issue more clearly'),
    3,
    null
  )$$,
  'an admin can reopen a completed update'
);
select is(
  (select completed_version from public.app_updates where body_markdown = 'Fix the first issue more clearly'),
  null,
  'reopened update has no completion version'
);
select lives_ok(
  $$select public.admin_update_archive(
    (select id from public.app_updates where body_markdown = 'Fix the first issue more clearly'),
    4
  )$$,
  'an admin can archive an update'
);
select lives_ok(
  $$select public.admin_update_restore(
    (select id from public.app_updates where body_markdown = 'Fix the first issue more clearly'),
    5
  )$$,
  'an admin can restore an update'
);
select is(
  (select is_archived from public.app_updates where body_markdown = 'Fix the first issue more clearly'),
  false,
  'restoring an update returns it to the active list'
);
select is(
  (select count(*)::integer
   from public.admin_update_events
   where update_id = (select id from public.app_updates where body_markdown = 'Fix the first issue more clearly')),
  6,
  'create, edit, completion, archive, and restore are audited atomically'
);
select throws_ok(
  $$update public.admin_update_events set event_type = 'edited'$$,
  '42501',
  null,
  'authenticated admins cannot alter audit events'
);

reset role;
delete from auth.users
where id = '28000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from public.app_updates where body_markdown = 'Fix the first issue more clearly'),
  1,
  'deleting the actor account does not delete global updates'
);
select is(
  (select actor_id from public.admin_update_events order by id limit 1),
  null::uuid,
  'deleting the actor nulls audit attribution without deleting history'
);

select * from finish();
rollback;

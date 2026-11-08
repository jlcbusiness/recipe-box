drop trigger app_updates_record_event on public.app_updates;

create trigger app_updates_record_event
  after insert or update of body_markdown, kind, completed_version, is_archived, revision
  on public.app_updates
  for each row
  execute function public.record_admin_update_event();

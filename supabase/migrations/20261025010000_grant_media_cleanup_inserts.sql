grant select, insert, update, delete on public.media_deletion_queue to service_role;
grant usage, select on sequence public.media_deletion_queue_id_seq to service_role;

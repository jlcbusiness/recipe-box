grant select, insert, update, delete on public.export_deletion_queue to service_role;
grant usage, select on sequence public.export_deletion_queue_id_seq to service_role;
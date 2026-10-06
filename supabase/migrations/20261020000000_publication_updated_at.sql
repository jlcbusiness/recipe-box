create function public.publication_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger publications_updated_at
  before update on public.publications
  for each row execute procedure public.publication_updated_at();
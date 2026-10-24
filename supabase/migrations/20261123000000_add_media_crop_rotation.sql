alter table public.media_assets
  drop constraint media_assets_crop_valid;

alter table public.media_assets
  disable trigger media_crop_history_after_update;

update public.media_assets
set crop = crop || jsonb_build_object('rotation', 0)
where crop is not null;

alter table public.media_assets
  enable trigger media_crop_history_after_update;

alter table public.media_assets
  add constraint media_assets_crop_valid check (
    crop is null or case
      when jsonb_typeof(crop) <> 'object' then false
      when not (crop ?& array['left', 'top', 'width', 'height', 'rotation']) then false
      when crop - array['left', 'top', 'width', 'height', 'rotation'] <> '{}'::jsonb then false
      when jsonb_typeof(crop->'left') <> 'number'
        or jsonb_typeof(crop->'top') <> 'number'
        or jsonb_typeof(crop->'width') <> 'number'
        or jsonb_typeof(crop->'height') <> 'number'
        or jsonb_typeof(crop->'rotation') <> 'number'
      then false
      else
        (crop->>'left')::numeric >= 0
        and (crop->>'top')::numeric >= 0
        and (crop->>'width')::numeric > 0
        and (crop->>'height')::numeric > 0
        and (crop->>'left')::numeric + (crop->>'width')::numeric <= 1
        and (crop->>'top')::numeric + (crop->>'height')::numeric <= 1
        and (crop->>'rotation')::numeric in (0, 90, 180, 270)
    end
  );
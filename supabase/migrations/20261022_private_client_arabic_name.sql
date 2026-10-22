-- Preferred Arabic client spelling for printed daily accounting.
-- Retains canonical English names and all existing private session data.
begin;
alter table public.private_clients
  add column if not exists arabic_name text not null default '';
alter table public.private_clients
  drop constraint if exists private_clients_arabic_name_valid;
alter table public.private_clients
  add constraint private_clients_arabic_name_valid
    check (char_length(arabic_name)<=120 and (
      arabic_name='' or (arabic_name ~ '[ء-ي]' and arabic_name !~ '[A-Za-z]')
    ));

-- Staff may explicitly correct Arabic print names through this audited endpoint.
-- Direct table writes and existing client/financial RPCs remain untouched.
create or replace function public.private_set_arabic_name(
  p_client_id uuid, p_arabic_name text default ''
) returns void language plpgsql security definer
set search_path=public,pg_temp as $$
declare v_arabic text:=btrim(coalesce(p_arabic_name,''));
        v_before text;
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if p_client_id is null then raise exception 'Client is required'; end if;
 if char_length(v_arabic)>120 or
    (v_arabic<>'' and (v_arabic !~ '[ء-ي]' or v_arabic ~ '[A-Za-z]'))
 then raise exception 'Use an Arabic spelling (up to 120 characters)'; end if;

 select arabic_name into v_before
 from public.private_clients where id=p_client_id for update;
 if not found then raise exception 'Private client not found'; end if;
 if v_before=v_arabic then return; end if;
 update public.private_clients set arabic_name=v_arabic where id=p_client_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'UPDATE','private_clients',p_client_id::text,
   jsonb_build_object('arabic_name',v_before),
   jsonb_build_object('arabic_name',v_arabic));
end$$;

revoke all on function public.private_set_arabic_name(uuid,text) from public,anon;
grant execute on function public.private_set_arabic_name(uuid,text) to authenticated;
commit;

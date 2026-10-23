-- Do not retain historical tournament names in close-event audit rows.
begin;
create or replace function public.tournament_close(p_id uuid,p_expected_version bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tournaments%rowtype;
begin
 if not public.is_admin() then raise exception 'Only administrators may close tournaments';end if;
 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found';end if;
 if t.version is distinct from p_expected_version
 then raise exception 'Tournament changed. Refresh, download a new PDF and retry';end if;
 delete from public.tournaments where id=p_id;
 -- No scores, names, or financial account details retained after deletion.
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'DELETE','tournaments',p_id::text,
   jsonb_build_object('removed',true),null);
end;$$;


commit;
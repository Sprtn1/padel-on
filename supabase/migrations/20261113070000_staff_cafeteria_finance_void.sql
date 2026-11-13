-- Allow staff to void only Cafeteria Finances ledger entries through the existing
-- audited correction RPCs. This does not grant any direct UPDATE/DELETE privileges,
-- or modify the access rules for other pages or financial day approval.
begin;

create or replace function public.cafeteria_finance_void_entry(
 p_entry_id uuid,p_reason text
) returns void language plpgsql security definer
set search_path=public,pg_temp as $function$
declare v_previous public.cafeteria_finance_entries%rowtype;
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 4 and 500
 then raise exception 'Enter a correction reason (4 to 500 characters)'; end if;
 select * into v_previous from public.cafeteria_finance_entries where id=p_entry_id for update;
 if not found or v_previous.voided_at is not null then raise exception 'Entry already voided or not found'; end if;
 -- The existing cafeteria_closed_entries_guard trigger rejects closed/approved days.
 update public.cafeteria_finance_entries
 set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason) where id=p_entry_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'VOID','cafeteria_finance_entries',p_entry_id::text,
   to_jsonb(v_previous),jsonb_build_object('reason',btrim(p_reason)));
end$function$;

create or replace function public.whish_void_entry(
 p_entry_id uuid,p_reason text
) returns void language plpgsql security definer
set search_path=public,pg_temp as $function$
declare v_previous public.whish_ledger_entries%rowtype;
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 4 and 500
 then raise exception 'Provide a correction reason (4 to 500 characters)'; end if;
 select * into v_previous from public.whish_ledger_entries where id=p_entry_id for update;
 if not found or v_previous.voided_at is not null
 then raise exception 'Whish entry is missing or already voided'; end if;
 -- Non-admins can correct only standalone Whish entries displayed in
 -- Cafeteria Finances. Linked court/private payments must use their source workflow.
 if not public.is_admin() and
   (v_previous.source_private_entry_id is not null or v_previous.source_court_split_id is not null)
 then raise exception 'Linked payments must be corrected through their source entry'; end if;
 -- The existing cafeteria_closed_whish_guard trigger protects closed days.
 update public.whish_ledger_entries
  set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason)
  where id=p_entry_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'VOID','whish_ledger_entries',p_entry_id::text,
  to_jsonb(v_previous),jsonb_build_object('reason',btrim(p_reason)));
end$function$;

-- Functions already exist; keep the same authenticated-only EXECUTE grants.
revoke all on function public.cafeteria_finance_void_entry(uuid,text) from public,anon;
revoke all on function public.whish_void_entry(uuid,text) from public,anon;
grant execute on function public.cafeteria_finance_void_entry(uuid,text) to authenticated;
grant execute on function public.whish_void_entry(uuid,text) to authenticated;

commit;

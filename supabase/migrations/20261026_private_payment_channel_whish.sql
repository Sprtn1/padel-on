-- Private receipts can be assigned to cash (default) or Whish.
-- Existing transactions and client balances are preserved.
begin;
alter table public.private_ledger_entries
 add column if not exists payment_channel text not null default 'cash';
alter table public.private_ledger_entries
 drop constraint if exists private_payment_channel_valid;
alter table public.private_ledger_entries
 add constraint private_payment_channel_valid check(payment_channel in ('cash','whish'));

-- Whish wallet rows linked to private entries are real deposits, not derived totals.
alter table public.whish_ledger_entries
 add column if not exists source_private_entry_id uuid references public.private_ledger_entries(id) on delete restrict;
create unique index if not exists whish_private_receipt_active_unique
 on public.whish_ledger_entries(source_private_entry_id)
 where source_private_entry_id is not null and voided_at is null;

create or replace function public.private_sync_whish_receipt()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_amount bigint; v_client public.private_clients%rowtype; v_label text;
begin
 v_amount:=case when NEW.entry_type='session' then NEW.paid_cents else NEW.deposit_cents end;
 if NEW.payment_channel='whish' and NEW.voided_at is null and v_amount>0 then
  select * into v_client from public.private_clients where id=NEW.client_id;
  v_label:=left('مشترك: '||
   left(coalesce(nullif(v_client.arabic_name,''),v_client.name,'مشترك'),80)||
   case when nullif(btrim(coalesce(v_client.client_code,'')),'') is not null
    then ' ('||left(v_client.client_code,30)||')' else '' end,120);
  if not exists(select 1 from public.whish_ledger_entries
    where source_private_entry_id=NEW.id and voided_at is null) then
   insert into public.whish_ledger_entries(
    id,entry_date,entry_type,name,amount_cents,created_by,source_private_entry_id
   ) values(gen_random_uuid(),NEW.entry_date,'deposit',v_label,v_amount,NEW.created_by,NEW.id);
  end if;
 else
  update public.whish_ledger_entries set
   voided_at=now(),voided_by=coalesce(auth.uid(),NEW.voided_by),
   void_reason=case when NEW.voided_at is not null then 'Linked private payment voided'
       else 'Private payment moved to cash' end
   where source_private_entry_id=NEW.id and voided_at is null;
 end if;
 return NEW;
end$$;

drop trigger if exists private_whish_receipt_sync on public.private_ledger_entries;
create trigger private_whish_receipt_sync
 after update of payment_channel,voided_at on public.private_ledger_entries
 for each row when (
  OLD.payment_channel is distinct from NEW.payment_channel or
  OLD.voided_at is distinct from NEW.voided_at
 ) execute function public.private_sync_whish_receipt();

-- Prevent direct voiding of linked receipts; correct them via private payment.
create or replace function public.whish_protect_private_receipt()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if OLD.source_private_entry_id is not null and pg_trigger_depth()<=1 then
  raise exception 'Correct this receipt with the private-payment Cash checkbox.';
 end if;
 return NEW;
end$$;
drop trigger if exists whish_private_receipt_protect on public.whish_ledger_entries;
create trigger whish_private_receipt_protect before update or delete
 on public.whish_ledger_entries for each row
 execute function public.whish_protect_private_receipt();

create or replace function public.private_set_payment_channel(p_entry_id uuid,p_cash boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_before public.private_ledger_entries%rowtype; v_next text; v_amount bigint;
begin
 if not public.is_staff() or auth.uid() is null then raise exception 'Authorized staff only'; end if;
 if p_entry_id is null or p_cash is null then raise exception 'Choose a valid private payment'; end if;
 v_next:=case when p_cash then 'cash' else 'whish' end;
 select * into v_before from public.private_ledger_entries where id=p_entry_id for update;
 if not found or v_before.voided_at is not null then raise exception 'Private payment not found'; end if;
 v_amount:=case when v_before.entry_type='session' then v_before.paid_cents else v_before.deposit_cents end;
 if v_amount<=0 then raise exception 'Only paid entries have a payment method'; end if;
 if v_before.payment_channel=v_next then return; end if;
 -- Existing closed-day trigger enforces the cashbook's approval workflow.
 update public.private_ledger_entries set payment_channel=v_next where id=p_entry_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'UPDATE','private_ledger_entries',p_entry_id::text,
  jsonb_build_object('payment_channel',v_before.payment_channel),
  jsonb_build_object('payment_channel',v_next,'amount_cents',v_amount));
end$$;

revoke all on function public.private_set_payment_channel(uuid,boolean) from public,anon;
grant execute on function public.private_set_payment_channel(uuid,boolean) to authenticated;
revoke all on function public.private_sync_whish_receipt() from public,anon,authenticated;
revoke all on function public.whish_protect_private_receipt() from public,anon,authenticated;
commit;
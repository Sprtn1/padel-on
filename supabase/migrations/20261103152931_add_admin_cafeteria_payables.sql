-- Applied to Supabase on 2026-11-03. Admin-only cafeteria obligations.
-- Admin-only outgoing obligations, intentionally separate from daily cashbook/Whish.
create table if not exists public.cafeteria_payables (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(btrim(title)) between 1 and 150),
 payee text not null check (char_length(btrim(payee)) between 1 and 150),
 total_cents bigint not null check (total_cents between 1 and 100000000000),
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id)
);
create table if not exists public.cafeteria_payable_payments (
 id uuid primary key,
 payable_id uuid not null references public.cafeteria_payables(id),
 amount_cents bigint not null check (amount_cents between 1 and 100000000000),
 paid_on date not null,
 notes text not null default '' check (char_length(notes) <= 500),
 created_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id)
);
create index if not exists cafeteria_payables_created_by_idx on public.cafeteria_payables(created_by);
create index if not exists cafeteria_payable_payments_payable_idx on public.cafeteria_payable_payments(payable_id, created_at);
create index if not exists cafeteria_payable_payments_created_by_idx on public.cafeteria_payable_payments(created_by);
alter table public.cafeteria_payables enable row level security;
alter table public.cafeteria_payable_payments enable row level security;
revoke all on public.cafeteria_payables from public, anon, authenticated;
revoke all on public.cafeteria_payable_payments from public, anon, authenticated;
grant select,insert on public.cafeteria_payables to authenticated;
grant select on public.cafeteria_payable_payments to authenticated;
create policy "admin_view_cafeteria_payables" on public.cafeteria_payables
 for select to authenticated using ((select public.is_admin()));
create policy "admin_create_cafeteria_payables" on public.cafeteria_payables
 for insert to authenticated with check ((select public.is_admin()) and created_by=(select auth.uid()));
create policy "admin_view_cafeteria_payable_payments" on public.cafeteria_payable_payments
 for select to authenticated using ((select public.is_admin()));

-- Atomic, idempotent partial or full settlements. The parent row lock protects
-- against simultaneous overpayments; the client supplies a stable transaction ID.
create or replace function public.cafeteria_record_payable_payment(
 p_id uuid, p_payable_id uuid, p_amount_cents bigint, p_paid_on date, p_notes text default ''
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 v_payable public.cafeteria_payables%rowtype;
 v_existing public.cafeteria_payable_payments%rowtype;
 v_paid bigint;
 v_notes text := btrim(coalesce(p_notes,''));
begin
 if auth.uid() is null or not public.is_admin() then
  raise exception 'Only administrators can record cafeteria payments';
 end if;
 if p_id is null or p_payable_id is null then raise exception 'Missing payment reference'; end if;
 if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 100000000000 then
  raise exception 'Enter a valid payment amount';
 end if;
 if p_paid_on is null or p_paid_on > (now() at time zone 'Asia/Beirut')::date then
  raise exception 'Payment date must be today or earlier';
 end if;
 if char_length(v_notes) > 500 then raise exception 'Notes must be 500 characters or fewer'; end if;

 select * into v_payable from public.cafeteria_payables where id=p_payable_id for update;
 if not found then raise exception 'Payable not found'; end if;
 select * into v_existing from public.cafeteria_payable_payments where id=p_id;
 if found then
  if v_existing.payable_id=p_payable_id and v_existing.amount_cents=p_amount_cents
     and v_existing.paid_on=p_paid_on and v_existing.notes=v_notes
     and v_existing.created_by=auth.uid() then return p_id; end if;
  raise exception 'Payment reference already in use';
 end if;
 select coalesce(sum(amount_cents),0) into v_paid
 from public.cafeteria_payable_payments where payable_id=p_payable_id;
 if p_amount_cents>v_payable.total_cents-v_paid then
  raise exception 'Payment exceeds the remaining balance';
 end if;
 insert into public.cafeteria_payable_payments(id,payable_id,amount_cents,paid_on,notes,created_by)
 values(p_id,p_payable_id,p_amount_cents,p_paid_on,v_notes,auth.uid());
 return p_id;
end$$;
revoke all on function public.cafeteria_record_payable_payment(uuid,uuid,bigint,date,text) from public,anon;
grant execute on function public.cafeteria_record_payable_payment(uuid,uuid,bigint,date,text) to authenticated;


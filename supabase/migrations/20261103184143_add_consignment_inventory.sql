-- Applied to Supabase; inventory and history isolated from finances.

-- Consignment inventory has no foreign keys or triggers to cafeteria finance,
-- debts, cashbook, Whish, private sessions, or sales.
create table public.consignment_items (
 id uuid primary key default gen_random_uuid(),
 category text not null check (char_length(btrim(category)) between 1 and 80),
 product_name text not null check (char_length(btrim(product_name)) between 1 and 160),
 brand text not null default '' check (char_length(brand)<=100),
 model text not null default '' check (char_length(model)<=120),
 size_label text not null default '' check (char_length(size_label)<=40),
 supplier text not null check (char_length(btrim(supplier)) between 1 and 160),
 selling_price_cents bigint not null check (selling_price_cents between 1 and 100000000000),
 quantity integer not null default 0 check (quantity between 0 and 1000000),
 notes text not null default '' check (char_length(notes)<=800),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id),
 updated_by uuid references auth.users(id),
 removed_at timestamptz,
 removed_by uuid references auth.users(id),
 removed_reason text
);
create table public.consignment_movements (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.consignment_items(id),
 kind text not null check (kind in ('opening','adjustment')),
 delta integer not null,
 quantity_after integer not null check (quantity_after between 0 and 1000000),
 reason text not null check (char_length(btrim(reason)) between 3 and 500),
 created_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id)
);
create index consignment_items_created_by_idx on public.consignment_items(created_by);
create index consignment_items_updated_by_idx on public.consignment_items(updated_by);
create index consignment_items_removed_by_idx on public.consignment_items(removed_by);
create index consignment_movements_item_created_idx on public.consignment_movements(item_id,created_at desc);
create index consignment_movements_created_by_idx on public.consignment_movements(created_by);
alter table public.consignment_items enable row level security;
alter table public.consignment_movements enable row level security;
revoke all on public.consignment_items from public,anon,authenticated;
revoke all on public.consignment_movements from public,anon,authenticated;
grant select on public.consignment_items to authenticated;
grant select on public.consignment_movements to authenticated;
create policy "Staff can view consignment items" on public.consignment_items
 for select to authenticated using ((select public.is_staff()));
create policy "Admins can view consignment movements" on public.consignment_movements
 for select to authenticated using ((select public.is_admin()));

-- All stock changes run server-side with an admin check and an audit movement.
create function public.consignment_create_item(
 p_id uuid, p_category text,p_product_name text,p_brand text,p_model text,
 p_size_label text,p_supplier text,p_selling_price_cents bigint,
 p_initial_quantity integer,p_notes text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_existing public.consignment_items%rowtype;
 v_category text:=btrim(coalesce(p_category,''));
 v_name text:=btrim(coalesce(p_product_name,''));
 v_brand text:=btrim(coalesce(p_brand,''));
 v_model text:=btrim(coalesce(p_model,''));
 v_size text:=btrim(coalesce(p_size_label,''));
 v_supplier text:=btrim(coalesce(p_supplier,''));
 v_notes text:=btrim(coalesce(p_notes,''));
begin
 if auth.uid() is null or not public.is_admin() then
  raise exception 'Only administrators can manage consignment inventory';
 end if;
 if p_id is null then raise exception 'Missing item reference'; end if;
 if char_length(v_category) not between 1 and 80 or
    char_length(v_name) not between 1 and 160 or char_length(v_brand)>100 or
    char_length(v_model)>120 or char_length(v_size)>40 or
    char_length(v_supplier) not between 1 and 160 or char_length(v_notes)>800 then
  raise exception 'Invalid consignment item details';
 end if;
 if p_selling_price_cents is null or p_selling_price_cents not between 1 and 100000000000 or
    p_initial_quantity is null or p_initial_quantity not between 0 and 1000000 then
  raise exception 'Invalid consignment price or quantity';
 end if;
 select * into v_existing from public.consignment_items where id=p_id;
 if found then
  if v_existing.created_by=auth.uid() and v_existing.removed_at is null
   and v_existing.category=v_category and v_existing.product_name=v_name
   and v_existing.brand=v_brand and v_existing.model=v_model and v_existing.size_label=v_size
   and v_existing.supplier=v_supplier and v_existing.notes=v_notes
   and v_existing.selling_price_cents=p_selling_price_cents
   and exists(select 1 from public.consignment_movements
    where item_id=p_id and kind='opening' and delta=p_initial_quantity)
  then return p_id; end if;
  raise exception 'Item reference is already in use';
 end if;
 insert into public.consignment_items
 (id,category,product_name,brand,model,size_label,supplier,selling_price_cents,quantity,notes,created_by,updated_by)
 values (p_id,v_category,v_name,v_brand,v_model,v_size,v_supplier,p_selling_price_cents,p_initial_quantity,v_notes,auth.uid(),auth.uid());
 insert into public.consignment_movements(item_id,kind,delta,quantity_after,reason,created_by)
 values(p_id,'opening',p_initial_quantity,p_initial_quantity,'Opening consignment quantity',auth.uid());
 return p_id;
end$$;

create function public.consignment_edit_item(
 p_id uuid,p_category text,p_product_name text,p_brand text,p_model text,
 p_size_label text,p_supplier text,p_selling_price_cents bigint,p_notes text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_category text:=btrim(coalesce(p_category,''));
 v_name text:=btrim(coalesce(p_product_name,''));
 v_brand text:=btrim(coalesce(p_brand,''));
 v_model text:=btrim(coalesce(p_model,''));
 v_size text:=btrim(coalesce(p_size_label,''));
 v_supplier text:=btrim(coalesce(p_supplier,''));
 v_notes text:=btrim(coalesce(p_notes,''));
begin
 if auth.uid() is null or not public.is_admin() then
  raise exception 'Only administrators can manage consignment inventory';
 end if;
 if p_id is null or char_length(v_category) not between 1 and 80 or
    char_length(v_name) not between 1 and 160 or char_length(v_brand)>100 or
    char_length(v_model)>120 or char_length(v_size)>40 or
    char_length(v_supplier) not between 1 and 160 or char_length(v_notes)>800 then
  raise exception 'Invalid consignment item details';
 end if;
 if p_selling_price_cents is null or p_selling_price_cents not between 1 and 100000000000 then
  raise exception 'Invalid selling price';
 end if;
 update public.consignment_items set category=v_category,product_name=v_name,
  brand=v_brand,model=v_model,size_label=v_size,supplier=v_supplier,
  selling_price_cents=p_selling_price_cents,notes=v_notes,
  updated_by=auth.uid(),updated_at=now()
 where id=p_id and removed_at is null;
 if not found then raise exception 'Consignment item not found'; end if;
 return p_id;
end$$;

create function public.consignment_adjust_stock(
 p_id uuid,p_delta integer,p_reason text
) returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_item public.consignment_items%rowtype;v_after integer;
 v_reason text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null or not public.is_admin() then
  raise exception 'Only administrators can manage consignment inventory';
 end if;
 if p_id is null or p_delta is null or p_delta=0 or abs(p_delta)>1000000
   or char_length(v_reason) not between 3 and 500 then
  raise exception 'Enter a valid nonzero stock adjustment and reason';
 end if;
 select * into v_item from public.consignment_items where id=p_id for update;
 if not found or v_item.removed_at is not null then raise exception 'Consignment item not found'; end if;
 v_after:=v_item.quantity+p_delta;
 if v_after<0 or v_after>1000000 then raise exception 'Stock cannot fall below zero or exceed the limit'; end if;
 update public.consignment_items set quantity=v_after,updated_at=now(),updated_by=auth.uid() where id=p_id;
 insert into public.consignment_movements(item_id,kind,delta,quantity_after,reason,created_by)
 values(p_id,'adjustment',p_delta,v_after,v_reason,auth.uid());
 return v_after;
end$$;

create function public.consignment_remove_item(
 p_id uuid,p_reason text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_reason text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null or not public.is_admin() then
  raise exception 'Only administrators can manage consignment inventory';
 end if;
 if p_id is null or char_length(v_reason) not between 3 and 500 then
  raise exception 'Enter a valid removal reason';
 end if;
 update public.consignment_items set removed_at=now(),removed_by=auth.uid(),
  removed_reason=v_reason,updated_by=auth.uid(),updated_at=now()
 where id=p_id and removed_at is null;
 if not found then raise exception 'Consignment item already removed or missing';end if;
 return p_id;
end$$;

revoke all on function public.consignment_create_item(uuid,text,text,text,text,text,text,bigint,integer,text) from public,anon;
revoke all on function public.consignment_edit_item(uuid,text,text,text,text,text,text,bigint,text) from public,anon;
revoke all on function public.consignment_adjust_stock(uuid,integer,text) from public,anon;
revoke all on function public.consignment_remove_item(uuid,text) from public,anon;
grant execute on function public.consignment_create_item(uuid,text,text,text,text,text,text,bigint,integer,text) to authenticated;
grant execute on function public.consignment_edit_item(uuid,text,text,text,text,text,text,bigint,text) to authenticated;
grant execute on function public.consignment_adjust_stock(uuid,integer,text) to authenticated;
grant execute on function public.consignment_remove_item(uuid,text) to authenticated;


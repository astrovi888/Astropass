-- =====================================================================================
--  AstroVault schema v3 (RUN AFTER schema_v2.sql. Safe to re-run.)
--  Adds: safe product deletion. Editing products and deleting single unsold stock items needs no SQL
--  (admins already have table access through the policies in schema.sql).
-- =====================================================================================
-- A product with orders or sold stock is HISTORY and cannot be deleted (use Hide). Otherwise delete it + its unsold stock.
create or replace function public.admin_delete_product(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select name into v_name from public.products where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from public.orders where product_id = p_id)
     or exists (select 1 from public.inventory_stock where product_id = p_id and status = 'sold') then
    raise exception 'has_history';
  end if;
  delete from public.inventory_stock where product_id = p_id;
  delete from public.products where id = p_id;
  perform public._audit('product.delete', p_id::text, jsonb_build_object('name', v_name));
end $$;
revoke all on function public.admin_delete_product(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_product(uuid) to authenticated;

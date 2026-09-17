-- Enforce business scope at the relational level, not only through RLS.
-- This prevents a row from one confectionery referencing a UUID owned by another tenant.

alter table public.products add column if not exists sale_unit text not null default 'un';
alter table public.products add column if not exists recipe_output_qty numeric(14,4) not null default 1 check (recipe_output_qty > 0);
alter table public.products add column if not exists recipe_output_unit text not null default 'un';
alter table public.product_variants add column if not exists recipe_output_qty numeric(14,4) not null default 1 check (recipe_output_qty > 0);
alter table public.product_variants add column if not exists recipe_output_unit text not null default 'un';
alter table public.order_items add column if not exists recipe_output_qty numeric(14,4);
alter table public.order_items add column if not exists recipe_output_unit text;

-- Composite candidate keys used by scoped foreign keys.
alter table public.customers add constraint customers_id_business_uk unique (id, business_id);
alter table public.inventory_items add constraint inventory_items_id_business_uk unique (id, business_id);
alter table public.products add constraint products_id_business_uk unique (id, business_id);
alter table public.product_variants add constraint product_variants_id_business_uk unique (id, business_id);
alter table public.recipes add constraint recipes_id_business_uk unique (id, business_id);
alter table public.recipe_versions add constraint recipe_versions_id_business_uk unique (id, business_id);
alter table public.quotes add constraint quotes_id_business_uk unique (id, business_id);
alter table public.orders add constraint orders_id_business_uk unique (id, business_id);
alter table public.order_items add constraint order_items_id_business_uk unique (id, business_id);
alter table public.production_orders add constraint production_orders_id_business_uk unique (id, business_id);
alter table public.suppliers add constraint suppliers_id_business_uk unique (id, business_id);
alter table public.purchases add constraint purchases_id_business_uk unique (id, business_id);

alter table public.product_variants add constraint product_variants_product_business_fk foreign key (product_id, business_id) references public.products(id, business_id) on delete cascade;
alter table public.recipes add constraint recipes_product_business_fk foreign key (product_id, business_id) references public.products(id, business_id) on delete set null;
alter table public.recipes add constraint recipes_variant_business_fk foreign key (product_variant_id, business_id) references public.product_variants(id, business_id) on delete set null;
alter table public.recipe_versions add constraint recipe_versions_recipe_business_fk foreign key (recipe_id, business_id) references public.recipes(id, business_id) on delete cascade;
alter table public.recipe_components add constraint recipe_components_version_business_fk foreign key (recipe_version_id, business_id) references public.recipe_versions(id, business_id) on delete cascade;
alter table public.recipe_components add constraint recipe_components_inventory_business_fk foreign key (inventory_item_id, business_id) references public.inventory_items(id, business_id) on delete restrict;
alter table public.recipe_components add constraint recipe_components_subrecipe_business_fk foreign key (sub_recipe_id, business_id) references public.recipes(id, business_id) on delete restrict;
alter table public.recipe_permissions add constraint recipe_permissions_recipe_business_fk foreign key (recipe_id, business_id) references public.recipes(id, business_id) on delete cascade;
alter table public.recipe_access_logs add constraint recipe_access_logs_recipe_business_fk foreign key (recipe_id, business_id) references public.recipes(id, business_id) on delete cascade;
alter table public.quote_items add constraint quote_items_quote_business_fk foreign key (quote_id, business_id) references public.quotes(id, business_id) on delete cascade;
alter table public.quote_items add constraint quote_items_product_business_fk foreign key (product_id, business_id) references public.products(id, business_id) on delete set null;
alter table public.quote_items add constraint quote_items_variant_business_fk foreign key (product_variant_id, business_id) references public.product_variants(id, business_id) on delete set null;
alter table public.orders add constraint orders_customer_business_fk foreign key (customer_id, business_id) references public.customers(id, business_id) on delete set null;
alter table public.orders add constraint orders_quote_business_fk foreign key (quote_id, business_id) references public.quotes(id, business_id) on delete set null;
alter table public.order_items add constraint order_items_order_business_fk foreign key (order_id, business_id) references public.orders(id, business_id) on delete cascade;
alter table public.order_items add constraint order_items_product_business_fk foreign key (product_id, business_id) references public.products(id, business_id) on delete set null;
alter table public.order_items add constraint order_items_variant_business_fk foreign key (product_variant_id, business_id) references public.product_variants(id, business_id) on delete set null;
alter table public.order_items add constraint order_items_recipe_version_business_fk foreign key (recipe_version_id, business_id) references public.recipe_versions(id, business_id) on delete set null;
alter table public.order_payments add constraint order_payments_order_business_fk foreign key (order_id, business_id) references public.orders(id, business_id) on delete cascade;
alter table public.inventory_reservations add constraint reservations_order_business_fk foreign key (order_id, business_id) references public.orders(id, business_id) on delete cascade;
alter table public.inventory_reservations add constraint reservations_order_item_business_fk foreign key (order_item_id, business_id) references public.order_items(id, business_id) on delete cascade;
alter table public.inventory_reservations add constraint reservations_inventory_business_fk foreign key (inventory_item_id, business_id) references public.inventory_items(id, business_id) on delete restrict;
alter table public.inventory_movements add constraint movements_inventory_business_fk foreign key (inventory_item_id, business_id) references public.inventory_items(id, business_id) on delete restrict;
alter table public.production_orders add constraint production_orders_order_business_fk foreign key (order_id, business_id) references public.orders(id, business_id) on delete set null;
alter table public.production_orders add constraint production_orders_recipe_business_fk foreign key (recipe_id, business_id) references public.recipes(id, business_id) on delete set null;
alter table public.production_orders add constraint production_orders_version_business_fk foreign key (recipe_version_id, business_id) references public.recipe_versions(id, business_id) on delete set null;
alter table public.production_steps add constraint production_steps_order_business_fk foreign key (production_order_id, business_id) references public.production_orders(id, business_id) on delete cascade;
alter table public.purchases add constraint purchases_supplier_business_fk foreign key (supplier_id, business_id) references public.suppliers(id, business_id) on delete set null;
alter table public.purchase_items add constraint purchase_items_purchase_business_fk foreign key (purchase_id, business_id) references public.purchases(id, business_id) on delete cascade;
alter table public.purchase_items add constraint purchase_items_inventory_business_fk foreign key (inventory_item_id, business_id) references public.inventory_items(id, business_id) on delete restrict;
alter table public.order_status_history add constraint order_status_history_order_business_fk foreign key (order_id, business_id) references public.orders(id, business_id) on delete cascade;

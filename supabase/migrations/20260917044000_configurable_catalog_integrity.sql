-- Relational tenant isolation for configurable catalog entities.
alter table public.product_option_groups
  add constraint product_option_groups_id_business_uk unique (id, business_id);

alter table public.product_options
  add constraint product_options_id_business_uk unique (id, business_id);

alter table public.product_option_groups
  add constraint product_option_groups_product_business_fk
  foreign key (product_id, business_id)
  references public.products(id, business_id)
  on delete cascade;

alter table public.product_options
  add constraint product_options_group_business_fk
  foreign key (group_id, business_id)
  references public.product_option_groups(id, business_id)
  on delete cascade;

alter table public.product_options
  add constraint product_options_recipe_business_fk
  foreign key (recipe_id, business_id)
  references public.recipes(id, business_id)
  on delete set null;

create index if not exists idx_product_option_groups_business_product
  on public.product_option_groups(business_id, product_id, sort_order);

create index if not exists idx_product_options_business_group
  on public.product_options(business_id, group_id, sort_order);

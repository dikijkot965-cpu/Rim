-- Add a leading-column index for every public-schema FK that does not already
-- have a valid covering index. This improves joins and parent-row delete/update
-- checks without duplicating existing composite indexes.
do $$
declare
  r record;
  v_index_name text;
begin
  for r in
    select c.conname as constraint_name,n.nspname as schema_name,t.relname as table_name,
      string_agg(quote_ident(a.attname), ', ' order by k.ord) as column_sql,
      c.conkey as key_columns
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    join unnest(c.conkey) with ordinality k(attnum,ord) on true
    join pg_attribute a on a.attrelid=t.oid and a.attnum=k.attnum
    where c.contype='f' and n.nspname='public'
      and not exists(
        select 1 from pg_index i
        where i.indrelid=c.conrelid and i.indisvalid
          and (i.indkey::smallint[])[0:cardinality(c.conkey)-1]=c.conkey
      )
    group by c.conname,n.nspname,t.relname,c.conkey
  loop
    v_index_name := 'rim_fk_' || left(r.table_name,36) || '_' || substr(md5(r.constraint_name),1,8);
    execute format('create index if not exists %I on %I.%I (%s)',v_index_name,r.schema_name,r.table_name,r.column_sql);
  end loop;
end $$;

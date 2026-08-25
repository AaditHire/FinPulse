create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.asset_kind as enum ('stock', 'crypto', 'macro');
create type public.bar_interval as enum ('5m', '1h', '1d');
create type public.provider_status as enum ('healthy', 'degraded', 'offline', 'unconfigured');
create type public.run_status as enum ('queued', 'running', 'completed', 'failed', 'evidence_only');
create type public.workload_class as enum ('interactive', 'scheduled');
create type public.alert_status as enum ('draft', 'active', 'paused', 'archived');

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.=-]{1,16}$'),
  name text not null,
  kind public.asset_kind not null,
  provider_symbol text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, kind, symbol)
);

create table public.portfolio_holdings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  quantity numeric(28, 10) not null check (quantity >= 0),
  cost_basis numeric(20, 4),
  updated_at timestamptz not null default now(),
  unique (owner_id, asset_id)
);

create table public.market_quotes (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  provider text not null,
  price numeric(24, 8) not null check (price >= 0),
  change_percent numeric(12, 6),
  currency text not null default 'USD',
  exchange_coverage text not null,
  as_of timestamptz not null,
  received_at timestamptz not null default now(),
  is_delayed boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  unique (owner_id, asset_id, provider)
);

create table public.market_bars (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  provider text not null,
  interval public.bar_interval not null,
  bucket_at timestamptz not null,
  open numeric(24, 8),
  high numeric(24, 8),
  low numeric(24, 8),
  close numeric(24, 8) not null,
  volume numeric(30, 8),
  created_at timestamptz not null default now(),
  unique (owner_id, asset_id, provider, interval, bucket_at)
);

create table public.news_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  content_hash text not null,
  title text not null,
  url text not null,
  publisher text not null,
  summary text,
  published_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (owner_id, content_hash)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  source_type text not null check (source_type in ('filing', 'news', 'macro', 'upload', 'web')),
  title text not null,
  source_url text,
  publisher text,
  published_at timestamptz,
  storage_path text,
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  unique (owner_id, content_hash)
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  heading text,
  content text not null,
  token_count integer not null check (token_count > 0 and token_count <= 700),
  embedding extensions.vector(384),
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(heading, '') || ' ' || content)
  ) stored,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table public.provider_health (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status public.provider_status not null,
  latency_ms integer,
  last_success_at timestamptz,
  last_error_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  unique (owner_id, provider)
);

create table public.database_size_snapshots (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  database_bytes bigint not null check (database_bytes >= 0),
  relation_bytes jsonb not null default '{}'::jsonb,
  utilization_percent numeric(6, 3) not null,
  action text not null check (action in ('ok', 'warn', 'prune', 'reject')),
  recorded_at timestamptz not null default now()
);

create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  specialist text not null default 'research',
  status public.run_status not null default 'queued',
  model_id text,
  answer text,
  citations jsonb not null default '[]'::jsonb,
  tool_calls jsonb not null default '[]'::jsonb,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  latency_ms integer,
  error_message text,
  guardrails jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.llm_model_policies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  model_id text not null,
  role text not null check (role in ('router', 'synthesis', 'fallback')),
  rpm integer not null check (rpm > 0),
  rpd integer not null check (rpd > 0),
  tpm integer not null check (tpm > 0),
  tpd integer not null check (tpd > 0),
  max_input_tokens integer not null default 5800,
  max_output_tokens integer not null default 1200,
  enabled boolean not null default true,
  effective_at timestamptz not null default now(),
  unique (owner_id, provider, model_id)
);

create table public.llm_quota_windows (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  model_id text not null,
  workload public.workload_class not null,
  limit_type text not null check (limit_type in ('requests_minute', 'requests_day', 'tokens_minute', 'tokens_day')),
  window_start timestamptz not null,
  used bigint not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider, model_id, workload, limit_type, window_start)
);

create table public.llm_usage_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid references public.research_runs(id) on delete set null,
  provider text not null,
  model_id text not null,
  workload public.workload_class not null,
  status text not null check (status in ('reserved', 'completed', 'failed', 'released')),
  estimated_tokens integer not null check (estimated_tokens >= 0),
  input_tokens integer,
  output_tokens integer,
  provider_request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete cascade,
  name text not null,
  rule_type text not null check (rule_type in ('price_above', 'price_below', 'change_percent', 'keyword', 'provider_health')),
  configuration jsonb not null,
  status public.alert_status not null default 'draft',
  requires_approval boolean not null default true,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  alert_rule_id uuid not null references public.alert_rules(id) on delete cascade,
  observed_value jsonb not null,
  message text not null,
  dedupe_key text not null,
  triggered_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  delivered_at timestamptz,
  delivery_error text,
  unique (owner_id, alert_rule_id, dedupe_key)
);

create table public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  token_prefix text not null,
  token_hash text not null unique,
  scopes text[] not null,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel text not null,
  content_hash text not null,
  scheduled_window timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  worker_id text,
  lease_expires_at timestamptz,
  sent_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, channel, content_hash, scheduled_window)
);

create table public.sent_articles (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  content_hash text not null,
  url text not null,
  symbol text,
  title text not null,
  sent_at timestamptz not null,
  imported_from text not null default 'typescript',
  unique (owner_id, content_hash),
  unique (owner_id, url)
);

create table public.notification_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  recipient text not null,
  delivery_time time not null default '08:00',
  timezone text not null default 'Asia/Kolkata',
  digest_enabled boolean not null default false,
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.keepalive_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  checked_at timestamptz not null default now()
);

create index assets_owner_kind_symbol_idx on public.assets (owner_id, kind, symbol);
create index portfolio_holdings_owner_idx on public.portfolio_holdings (owner_id);
create index portfolio_holdings_asset_idx on public.portfolio_holdings (asset_id);
create index market_quotes_owner_asset_idx on public.market_quotes (owner_id, asset_id, as_of desc);
create index market_bars_owner_asset_interval_time_idx on public.market_bars (owner_id, asset_id, interval, bucket_at desc);
create index market_bars_asset_idx on public.market_bars (asset_id);
create index news_owner_published_idx on public.news_items (owner_id, published_at desc);
create index news_asset_idx on public.news_items (asset_id);
create index documents_owner_type_time_idx on public.documents (owner_id, source_type, published_at desc);
create index documents_asset_idx on public.documents (asset_id);
create index chunks_owner_document_idx on public.document_chunks (owner_id, document_id, chunk_index);
create index chunks_document_idx on public.document_chunks (document_id);
create index chunks_search_idx on public.document_chunks using gin (search_vector);
create index chunks_embedding_idx on public.document_chunks using hnsw (embedding vector_cosine_ops) where embedding is not null;
create index provider_health_owner_status_idx on public.provider_health (owner_id, status, checked_at desc);
create index research_runs_owner_created_idx on public.research_runs (owner_id, created_at desc);
create index quota_window_lookup_idx on public.llm_quota_windows (owner_id, provider, model_id, workload, window_start desc);
create index usage_owner_model_created_idx on public.llm_usage_events (owner_id, provider, model_id, created_at desc);
create index alert_rules_owner_status_idx on public.alert_rules (owner_id, status, updated_at desc);
create index alert_rules_asset_idx on public.alert_rules (asset_id);
create index alert_events_rule_idx on public.alert_events (alert_rule_id, triggered_at desc);
create index mcp_tokens_owner_idx on public.mcp_tokens (owner_id, revoked_at, expires_at);
create index delivery_claim_idx on public.delivery_items (owner_id, status, scheduled_window) where status in ('pending', 'processing');
create index sent_articles_owner_time_idx on public.sent_articles (owner_id, sent_at desc);
create index keepalive_owner_time_idx on public.keepalive_events (owner_id, checked_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'assets','portfolio_holdings','market_quotes','market_bars','news_items','documents',
    'document_chunks','provider_health','database_size_snapshots','research_runs',
    'llm_model_policies','llm_quota_windows','llm_usage_events','alert_rules','alert_events',
    'mcp_tokens','delivery_items','sent_articles','notification_preferences','keepalive_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)',
      table_name || '_owner_policy', table_name
    );
  end loop;
end $$;

create or replace function public.match_document_chunks(
  p_owner_id uuid,
  p_query_text text,
  p_query_embedding extensions.vector(384),
  p_match_count integer default 6,
  p_rrf_k integer default 50
)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  source_url text,
  publisher text,
  published_at timestamptz,
  heading text,
  content text,
  score double precision
)
language sql stable security definer
set search_path = public, extensions
as $$
  with lexical as (
    select dc.id, row_number() over (order by ts_rank_cd(dc.search_vector, websearch_to_tsquery('english', p_query_text)) desc) as rank
    from public.document_chunks dc
    where dc.owner_id = p_owner_id and dc.search_vector @@ websearch_to_tsquery('english', p_query_text)
    order by ts_rank_cd(dc.search_vector, websearch_to_tsquery('english', p_query_text)) desc
    limit 20
  ), semantic as (
    select dc.id, row_number() over (order by dc.embedding <=> p_query_embedding) as rank
    from public.document_chunks dc
    where dc.owner_id = p_owner_id and dc.embedding is not null
    order by dc.embedding <=> p_query_embedding
    limit 20
  ), fused as (
    select coalesce(l.id, s.id) as id,
      coalesce(1.0 / (p_rrf_k + l.rank), 0.0) + coalesce(1.0 / (p_rrf_k + s.rank), 0.0) as score
    from lexical l full outer join semantic s on s.id = l.id
  )
  select dc.id, dc.document_id, d.title, d.source_url, d.publisher, d.published_at,
    dc.heading, dc.content, fused.score
  from fused
  join public.document_chunks dc on dc.id = fused.id
  join public.documents d on d.id = dc.document_id
  where dc.owner_id = p_owner_id
    and ((select auth.uid()) = p_owner_id or (select auth.role()) = 'service_role')
  order by fused.score desc
  limit least(greatest(p_match_count, 1), 6);
$$;

create or replace function public.reserve_llm_quota(
  p_owner_id uuid,
  p_provider text,
  p_model_id text,
  p_workload public.workload_class,
  p_estimated_tokens integer,
  p_run_id uuid default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  policy public.llm_model_policies%rowtype;
  daily_allocation numeric := case when p_workload = 'interactive' then 0.60 else 0.20 end;
  event_id uuid := gen_random_uuid();
  metric text;
  metric_limit bigint;
  metric_cost bigint;
  metric_window timestamptz;
begin
  if not ((select auth.uid()) = p_owner_id or (select auth.role()) = 'service_role') then
    raise exception 'not authorized';
  end if;
  if p_estimated_tokens < 1 then raise exception 'invalid token estimate'; end if;
  select * into policy from public.llm_model_policies
  where owner_id = p_owner_id and provider = p_provider and model_id = p_model_id and enabled
  for update;
  if not found then raise exception 'model policy not configured'; end if;
  if p_estimated_tokens > policy.max_input_tokens + policy.max_output_tokens then
    raise exception 'request exceeds model token policy';
  end if;

  foreach metric in array array['requests_minute','requests_day','tokens_minute','tokens_day'] loop
    metric_limit := case metric
      when 'requests_minute' then policy.rpm
      when 'requests_day' then policy.rpd
      when 'tokens_minute' then policy.tpm
      else policy.tpd end;
    metric_cost := case when metric like 'requests_%' then 1 else p_estimated_tokens end;
    metric_window := case when metric like '%minute' then date_trunc('minute', now()) else date_trunc('day', now()) end;
    perform pg_advisory_xact_lock(hashtext(concat(p_owner_id, ':', p_provider, ':', p_model_id, ':', metric, ':', metric_window)));
    if metric like '%minute' then
      if coalesce((select sum(used) from public.llm_quota_windows
        where owner_id = p_owner_id and provider = p_provider and model_id = p_model_id
          and limit_type = metric and window_start = metric_window), 0) + metric_cost > metric_limit then
        raise exception 'quota exceeded: %', metric;
      end if;
    else
      if coalesce((select used from public.llm_quota_windows
        where owner_id = p_owner_id and provider = p_provider and model_id = p_model_id
          and workload = p_workload and limit_type = metric and window_start = metric_window), 0) + metric_cost > floor(metric_limit * daily_allocation) then
        raise exception 'quota exceeded: %', metric;
      end if;
    end if;
    insert into public.llm_quota_windows(owner_id, provider, model_id, workload, limit_type, window_start, used)
    values (p_owner_id, p_provider, p_model_id, p_workload, metric, metric_window, metric_cost)
    on conflict (owner_id, provider, model_id, workload, limit_type, window_start)
    do update set used = public.llm_quota_windows.used + excluded.used, updated_at = now();
  end loop;

  insert into public.llm_usage_events(id, owner_id, run_id, provider, model_id, workload, status, estimated_tokens)
  values (event_id, p_owner_id, p_run_id, p_provider, p_model_id, p_workload, 'reserved', p_estimated_tokens);
  return event_id;
end;
$$;

create or replace function public.reconcile_llm_quota(
  p_owner_id uuid,
  p_event_id uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_status text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare event public.llm_usage_events%rowtype;
declare difference integer;
begin
  if not ((select auth.uid()) = p_owner_id or (select auth.role()) = 'service_role') then raise exception 'not authorized'; end if;
  select * into event from public.llm_usage_events where id = p_event_id and owner_id = p_owner_id for update;
  if not found or event.status <> 'reserved' then return; end if;
  difference := greatest(event.estimated_tokens - greatest(p_input_tokens + p_output_tokens, 0), 0);
  if difference > 0 then
    update public.llm_quota_windows set used = greatest(0, used - difference), updated_at = now()
    where owner_id = event.owner_id and provider = event.provider and model_id = event.model_id
      and workload = event.workload
      and ((limit_type = 'tokens_minute' and window_start = date_trunc('minute', event.created_at))
        or (limit_type = 'tokens_day' and window_start = date_trunc('day', event.created_at)))
      and window_start in (date_trunc('minute', event.created_at), date_trunc('day', event.created_at));
  end if;
  update public.llm_usage_events set status = case when p_status in ('completed','failed','released') then p_status else 'failed' end,
    input_tokens = greatest(p_input_tokens, 0), output_tokens = greatest(p_output_tokens, 0),
    metadata = coalesce(p_metadata, '{}'::jsonb), completed_at = now()
  where id = p_event_id;
end;
$$;

create or replace function public.claim_delivery_item(p_owner_id uuid, p_worker_id text)
returns public.delivery_items
language plpgsql security definer
set search_path = public
as $$
declare claimed public.delivery_items;
begin
  if not ((select auth.uid()) = p_owner_id or (select auth.role()) = 'service_role') then raise exception 'not authorized'; end if;
  update public.delivery_items set status = 'processing', worker_id = p_worker_id, lease_expires_at = now() + interval '10 minutes'
  where id = (
    select id from public.delivery_items
    where owner_id = p_owner_id and scheduled_window <= now()
      and (status = 'pending' or (status = 'processing' and lease_expires_at < now()))
    order by scheduled_window
    limit 1 for update skip locked
  ) returning * into claimed;
  return claimed;
end;
$$;

create or replace function public.database_size_report(p_owner_id uuid)
returns jsonb
language sql security definer
set search_path = public
as $$
  select case when ((select auth.uid()) = p_owner_id or (select auth.role()) = 'service_role') then jsonb_build_object(
    'databaseBytes', pg_database_size(current_database()),
    'limitBytes', 524288000,
    'utilizationPercent', round(pg_database_size(current_database())::numeric / 524288000 * 100, 3),
    'relations', coalesce((select jsonb_object_agg(relname, bytes) from (
      select c.relname, pg_total_relation_size(c.oid) as bytes
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','m') order by bytes desc limit 20
    ) sizes), '{}'::jsonb)
  ) else '{}'::jsonb end;
$$;

create or replace function public.prune_expired_data(p_owner_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare bars_5m integer; bars_1h integer; news integer;
begin
  if not ((select auth.uid()) = p_owner_id or (select auth.role()) = 'service_role') then raise exception 'not authorized'; end if;
  delete from public.market_bars where owner_id = p_owner_id and interval = '5m' and bucket_at < now() - interval '7 days'; get diagnostics bars_5m = row_count;
  delete from public.market_bars where owner_id = p_owner_id and interval = '1h' and bucket_at < now() - interval '90 days'; get diagnostics bars_1h = row_count;
  delete from public.news_items where owner_id = p_owner_id and published_at < now() - interval '90 days'; get diagnostics news = row_count;
  delete from public.news_items where id in (
    select id from (
      select id, row_number() over (partition by owner_id, asset_id order by published_at desc, id) as position
      from public.news_items where owner_id = p_owner_id
    ) ranked where position > 1000
  );
  delete from public.documents where owner_id = p_owner_id and source_type = 'filing'
    and published_at < now() - interval '2 years';
  delete from public.document_chunks where id in (
    select chunk_id from (
      select dc.id as chunk_id,
        row_number() over (partition by coalesce(d.metadata->>'symbol', d.asset_id::text, d.id::text)
          order by d.published_at desc nulls last, dc.chunk_index) as position
      from public.document_chunks dc join public.documents d on d.id = dc.document_id
      where dc.owner_id = p_owner_id and d.source_type = 'filing'
    ) ranked where position > 500
  );
  delete from public.llm_quota_windows where owner_id = p_owner_id and window_start < now() - interval '2 days';
  delete from public.keepalive_events where owner_id = p_owner_id and checked_at < now() - interval '30 days';
  return jsonb_build_object('bars5m', bars_5m, 'bars1h', bars_1h, 'news', news);
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('research-documents', 'research-documents', false, 52428800, array['application/pdf','text/plain','text/markdown','text/html','application/json'])
on conflict (id) do nothing;

create policy research_documents_owner_select on storage.objects for select to authenticated
using (bucket_id = 'research-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy research_documents_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'research-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy research_documents_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'research-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

grant execute on function public.match_document_chunks(uuid, text, extensions.vector, integer, integer) to authenticated, service_role;
grant execute on function public.reserve_llm_quota(uuid, text, text, public.workload_class, integer, uuid) to authenticated, service_role;
grant execute on function public.reconcile_llm_quota(uuid, uuid, integer, integer, text, jsonb) to authenticated, service_role;
grant execute on function public.claim_delivery_item(uuid, text) to authenticated, service_role;
grant execute on function public.database_size_report(uuid) to authenticated, service_role;
grant execute on function public.prune_expired_data(uuid) to authenticated, service_role;

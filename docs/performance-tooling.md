# MicroSeem Performance Tooling Strategy

MicroSeem started as a focused Microsoft 365 SIEM, but the next architecture should be able to grow toward Wazuh-class breadth without inheriting the operational weight of a JVM-heavy Elastic/Kafka stack.

## Recommendation

Use **ClickHouse + NATS JetStream** as the default hot-path platform, with an optional **Quickwit/Tantivy search tier** only where Lucene-style full-text search is truly required.

This gives MicroSeem a lightweight path that keeps the Go backend and custom UI, removes Kibana and Kafka from the minimum install, and still supports high-ingest, high-cardinality security analytics.

## Current baseline

The current local stack is useful for prototyping but is not the target for a super-light SIEM:

- `docker-compose.yml` runs PostgreSQL, Elasticsearch, Kibana, and Kafka.
- The backend writes M365 audit batches into Kafka; the Kafka consumer then bulk-indexes logs into Elasticsearch.
- The log API reads from Elasticsearch, and Kibana is embedded for deeper analytics.

## Tooling decision matrix

| Layer | Current | Recommended default | Why | Keep/optional when |
| --- | --- | --- | --- | --- |
| Event bus | Kafka | **NATS JetStream** | Single Go binary, built-in persistence, replay, queue consumers, no ZooKeeper/JVM dependency. NATS describes JetStream as built into `nats-server`, with persistence, replay, replication, and goals around high ingestion and easy operation: <https://docs.nats.io/nats-concepts/jetstream>. | Use **Redpanda** when Kafka protocol compatibility is required for existing collectors or customer pipelines. Redpanda documents Kafka API compatibility: <https://docs.redpanda.com/current/develop/kafka-clients/>. |
| Hot log store | Elasticsearch | **ClickHouse** | Columnar storage, compression, vectorized analytics, fast aggregations over wide log events. ClickHouse positions ClickStack as an open-source observability stack for logs, metrics, traces, and sessions on ClickHouse: <https://clickhouse.com/use-cases/observability>. | Keep Elasticsearch/OpenSearch only for deployments that already operate it or need Kibana/OpenSearch Dashboards compatibility. |
| Text search | Elasticsearch | **ClickHouse token/bloom/ngram indexes first; Quickwit/Tantivy optional** | Most SIEM screens filter by tenant, time, operation, user, IP, workload, severity, rule, and IOC fields. Use structured search first. Add Quickwit if analysts require fast arbitrary JSON/text search at larger retention windows. Quickwit describes itself as a search engine for logs/audit/security data, powered by Tantivy and able to search from object storage: <https://quickwit.io/docs/overview/introduction>. | Use Quickwit for cold/full-text search, raw-message search, and object-storage-backed retention. |
| Collection | Custom M365 poller only | **OpenTelemetry Collector + Vector/Fluent Bit adapters** | Keep the native M365 poller, but normalize all sources into a single internal event envelope. OpenTelemetry Collector gives common receivers/exporters/processors; Vector or Fluent Bit can cover lightweight host/container forwarding. | Endpoint agents, syslog, cloud APIs, EDR, vulnerability feeds, and network sensors. |
| Detection content | Custom rules | **Sigma-compatible rule layer + native high-speed rules** | Sigma gives portability for common SIEM detections; native rules remain for MicroSeem-specific correlation, suppression, and response workflows. | Keep custom rule editor as the UX; compile rules into fast predicates/SQL. |
| UI | React + Kibana embed | **React-native analytics UI** | Removing Kibana is the biggest install-size simplification after replacing Elasticsearch. Build saved searches, dashboards, timelines, and rule drilldowns directly against ClickHouse APIs. | Offer Kibana/OpenSearch/ClickStack export integrations for teams that already use them. |
| Long retention | Elasticsearch indices | **S3-compatible object storage + ClickHouse/Quickwit retention tiers** | Keep hot data in ClickHouse partitions; compact/archive raw normalized events to object storage; query cold text through Quickwit if enabled. | Compliance and low-cost historical investigations. |

## Target reference architecture

```text
Collectors / Integrations
  ├─ Microsoft 365 Management Activity API poller
  ├─ Microsoft Graph security and identity sources
  ├─ Syslog / CEF / LEEF / JSON HTTP ingest
  ├─ OpenTelemetry Collector receivers
  └─ Optional endpoint agent/osquery/EDR imports
          │
          ▼
Normalizer + Enrichment (Go)
  ├─ Stable MicroSeem event envelope
  ├─ Tenant/org isolation fields
  ├─ GeoIP, ASN, user/entity enrichment
  ├─ MITRE ATT&CK and rule metadata
  └─ IOC/threat-intel joins
          │
          ▼
NATS JetStream
  ├─ durable raw event stream
  ├─ detection consumers
  ├─ storage consumers
  └─ replay/backfill consumers
          │
          ├──────────────► Detection Engine (Go)
          │                  ├─ native rules
          │                  ├─ Sigma-compiled rules
          │                  ├─ correlation windows
          │                  └─ alert/investigation events
          │
          ▼
ClickHouse hot store
  ├─ partitioned by day/month and organization
  ├─ sorted by org, event time, tenant, workload, operation, user, IP
  ├─ projections/materialized views for dashboard cards
  └─ TTL policies for hot retention
          │
          ├──────────────► Optional Quickwit full-text/cold search
          │
          ▼
MicroSeem React UI + API
  ├─ dashboards
  ├─ live search
  ├─ alert triage
  ├─ investigations
  ├─ compliance reports
  └─ response/integration actions
```

## Why this is the best default

### ClickHouse should replace Elasticsearch for the hot path

Security analytics usually needs fast time-bounded scans, grouping, cardinality, top-N, trends, and joins over structured fields. ClickHouse is a better fit for that hot path than a general-purpose inverted-index engine because it compresses columns aggressively and avoids indexing every field like Elasticsearch. For MicroSeem this means:

- lower memory floor for a single-node install;
- faster dashboard and hunt aggregations over M365/security fields;
- cheaper retention through partitions, TTLs, and compressed columnar data;
- simpler query planning for multi-tenant isolation because `organization_id` can be part of the sort key and row-policy strategy.

### NATS JetStream should replace Kafka for the default install

MicroSeem needs durable ingestion, replay, backpressure, and multiple consumers, but it does not need Kafka's operational footprint for the common single-node or small-cluster install. JetStream covers the required ingestion semantics while staying close to the Go ecosystem and keeping deployment small.

Use Redpanda as the compatibility tier if a customer requires Kafka APIs. Do not make it the default unless external Kafka compatibility matters more than minimum footprint.

### Quickwit should be optional, not mandatory

Elastic-like performance is not one thing. For dashboards and structured SIEM hunting, ClickHouse is the default winner. For arbitrary text search across raw JSON and long retention, a search engine is still valuable. Quickwit is the best lightweight add-on because it is Rust/Tantivy-based and designed for log/audit/security search over object storage.

The product should therefore expose one search UX with two execution paths:

1. **Structured mode:** ClickHouse SQL for time, tenant, workload, operation, user, IP, geo, severity, rule, IOC, and parsed JSON fields.
2. **Full-text mode:** Quickwit when enabled; otherwise ClickHouse token/ngram search with clear limits.

## Proposed ClickHouse schema direction

Use one wide normalized event table for hot investigations, plus derived tables for alerting and dashboard speed.

```sql
CREATE TABLE security_events
(
    organization_id UUID,
    tenant_id UUID,
    event_time DateTime64(3, 'UTC'),
    ingest_time DateTime64(3, 'UTC'),
    source LowCardinality(String),
    workload LowCardinality(String),
    operation LowCardinality(String),
    severity LowCardinality(String),
    user_id String,
    src_ip IPv6,
    country_code LowCardinality(String),
    city LowCardinality(String),
    record_type UInt32,
    event_id String,
    raw_json String,
    attrs Map(String, String),
    rule_ids Array(String),
    mitre_techniques Array(String)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (organization_id, event_time, tenant_id, workload, operation, user_id, src_ip)
TTL event_time + INTERVAL 90 DAY DELETE;
```

Add materialized views for:

- per-minute ingest rates by organization/source;
- auth failures and risky sign-ins by user/IP/country;
- top operations/workloads;
- alert counts by severity/rule/status;
- entity timelines keyed by user, IP, host, file hash, and cloud resource.

## SIEM feature roadmap toward Wazuh-class breadth

1. **Storage abstraction:** introduce an internal `LogStore` interface so Elasticsearch and ClickHouse can coexist during migration.
2. **JetStream ingestion path:** route ingestion through the `internal/eventbus` boundary, add NATS behind a feature flag, then migrate the default compose stack from Kafka to NATS.
3. **ClickHouse writer/query API:** add batch insert, pagination, field filters, and dashboard aggregate endpoints.
4. **Detection engine v2:** separate collection, enrichment, detection, and storage consumers; add rule versioning and replay tests.
5. **Sigma support:** parse Sigma rules into native predicates or ClickHouse SQL, with rule packs for Microsoft, identity, endpoint, network, and cloud.
6. **Broader integrations:** add syslog/CEF/LEEF, OpenTelemetry, AWS CloudTrail, Google Workspace, GitHub audit logs, Okta, Entra ID risk events, Defender, and osquery imports.
7. **Response actions:** add webhook-driven actions, ticketing, Teams/Slack notifications, enrichment lookups, and containment hooks.
8. **Retention tiers:** ClickHouse hot TTL, object-storage raw archive, optional Quickwit cold/full-text search.
9. **Performance harness:** generate repeatable synthetic M365/security events and benchmark ingest, query latency, memory, disk compression, and replay.

## Migration plan for this repository

### Phase 1: prepare without breaking the current stack

- Add `internal/store` with interfaces for `BulkInsert`, `Search`, `Aggregate`, and `Health`.
- Move the existing Elasticsearch client behind that interface.
- Add benchmark fixtures for representative M365 events.
- Keep PostgreSQL for identity/configuration metadata.

### Phase 2: add ClickHouse and NATS side-by-side

- Add ClickHouse and NATS services to a new `docker-compose.light.yml`, with `MICROSEEM_EVENT_BUS=nats` publishing to JetStream and mirroring into ClickHouse for the current API query path.
- Implement `internal/clickhouse` for bulk inserts and search queries.
- Implement `internal/natsbus` publishing through the `internal/eventbus` boundary, then add durable pull-consumer replay workers for backfill/reprocessing.
- Add an env switch such as `MICROSEEM_PIPELINE=elastic-kafka|clickhouse-nats`.

### Phase 3: make lightweight the default

- Change the default compose stack to PostgreSQL + ClickHouse + NATS + backend + frontend.
- Move Elasticsearch/Kafka/Kibana to `docker-compose.elastic.yml` for compatibility.
- Replace the Kibana embed with native dashboard panels backed by ClickHouse aggregate endpoints.

## Benchmark targets

Use explicit, repeatable targets before claiming Elastic-class performance:

| Area | Target |
| --- | --- |
| Minimum single-node RAM | backend + frontend + PostgreSQL + NATS + ClickHouse under 2 GB idle |
| Ingest | 50k normalized events/minute on a laptop-class 4-core dev machine |
| Hot search | p95 under 500 ms for common 24-hour tenant/user/IP filters at 10M events |
| Dashboards | p95 under 300 ms from materialized views |
| Replay | deterministic reprocessing from JetStream by stream sequence/time window |
| Storage | measure compressed bytes/event by source and retention tier |

## Bottom line

For a Wazuh-class but lightweight MicroSeem, the strongest default stack is:

```text
Go backend + React UI + PostgreSQL metadata
+ NATS JetStream ingestion/replay
+ ClickHouse hot security analytics
+ Sigma/native detection engine
+ optional Quickwit/Tantivy for full-text and cold search
+ optional Redpanda/Kafka and Elasticsearch/OpenSearch compatibility adapters
```

This keeps MicroSeem small enough for self-hosted teams while giving it a credible scale path for high-volume security analytics.

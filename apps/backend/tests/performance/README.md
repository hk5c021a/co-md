# Performance Validation Tests

This directory contains T119A-D performance validation scripts.

## Running Tests

```bash
# T119A: PostgreSQL Document Scale Validation (100,000 documents)
pnpm --filter backend exec tsx tests/performance/t119a-document-scale.ts

# T119B: RustFS File Asset Performance Validation (500 QPS)
pnpm --filter backend exec tsx tests/performance/t119b-rustfs-performance.ts


# T119D: Contact Search Performance Validation (10,000 users)
pnpm --filter backend exec tsx tests/performance/t119d-contact-search.ts
```

## Prerequisites

- PostgreSQL running on test port (5434)
- Redis running on test port (6380)
- RustFS running on test port (9001)

Start test infrastructure:

```bash
docker compose -f docker-compose.test.yml up -d
```

## Test Targets

| Test  | Metric                    | Target      |
| ----- | ------------------------- | ----------- |
| T119A | Document list query       | < 200ms     |
| T119B | PUT/GET latency @ 500 QPS | P95 < 500ms |

| T119D | Contact search | < 2 seconds |

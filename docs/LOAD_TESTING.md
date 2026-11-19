# Staging load test plan

Do not target production. Do not run until the Supabase staging project has an isolated dataset and approved quotas.

## Workloads to model

- 100k registered accounts (dataset size, not 100k simultaneous sessions).
- 1k / 5k / 10k simultaneous authenticated sessions as staged ramps.
- 100 / 500 / 1,000 chat messages per second as separate message-write profiles.
- Realtime fan-out for direct chats and groups with measured subscriber counts.
- Channel read bursts and paginated history retrieval.
- Upload and download throughput for images/audio, including storage egress.

## Measurements

Capture request rate, p50/p95/p99 latency, 4xx/5xx rate, database CPU/memory, connection pool saturation, Realtime disconnects, queue depth, storage egress, and client memory. Define pass/fail thresholds with the service owner before running the test.

## Important

A 100k virtual-user test is not the first test. Ramp gradually, stop on error-rate or saturation thresholds, and test with representative RLS policies and realistic row distributions. A test using service-role credentials does not represent the actual client security model.

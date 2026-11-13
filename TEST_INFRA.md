# Test Infrastructure Specification (TEST_INFRA.md)
## Commercial Traffic Server (VietQR & Lightweight Request Engine)

**Version**: 1.0.0-PROD  
**Author**: E2E Testing Track (`teamwork_test_writer`)  
**Scope Document**: `.agents/teamwork/sub_orch_e2e_testing/SCOPE.md`  
**Test Suite Directory**: `e2e_tests/`  
**Master Test Runner**: `e2e_tests/run_all_tests.js`  

---

## 1. Executive Summary & Testing Philosophy

The **Commercial Traffic Server** test infrastructure is architected according to strict **Opaque-Box Requirement-Driven Testing** principles:

1. **Strictly Opaque-Box**: All test assertions execute strictly against public external interfaces:
   - Public REST API endpoints (`POST /api/orders`, `GET /api/orders/:id`, `POST /api/orders/:id/confirm`, `POST /api/orders/calculate-cost`, etc.).
   - Authoritative public calculation and contract interfaces (`orderService.js`, `timeDistribution.js`).
   - Loopback network mocks (Mock Target Web Server and Mock KiotProxy API Server).
   - Real-time Socket.IO telemetry streaming (`stats-update`, `status-update`, `payment-confirmed`).
   - Zero coupling to internal private memory variables or unexported implementation details.
2. **Zero External Test Framework Dependencies**:
   - The test harness is built natively for **Node.js v26.7.0** using built-in modules (`node:assert/strict`, `node:http`, `node:net`, `node:child_process`, `node:fs`, `node:path`, and native global `fetch`).
   - No external testing frameworks (Jest, Mocha, Vitest, Supertest) are required, ensuring zero version conflict with production dependencies.
3. **Reproducible & Hermetic**:
   - Dynamic ephemeral port allocation eliminates local TCP port collision.
   - Loopback mock servers intercept proxy rotation and destination web requests, ensuring tests run completely offline without hitting the public internet or consuming paid KiotProxy credits.

---

## 2. Test Pyramid & 4-Tier Hierarchy

The test suite spans **268 test cases** organized across a 4-tier test pyramid:

```
                      ┌─────────────────────────────────────────┐
                      │        Tier 4: Real-World Flows         │
                      │       (12 End-to-End Scenarios)         │
                      └────────────────────┬────────────────────┘
                                           │
                      ┌────────────────────┴────────────────────┐
                      │        Tier 3: Cross-Feature            │
                      │        Combinations (26 Tests)          │
                      └────────────────────┬────────────────────┘
                                           │
               ┌───────────────────────────┴───────────────────────────┐
               │                                                       │
 ┌─────────────┴─────────────┐                           ┌─────────────┴─────────────┐
 │ Tier 1: Feature Coverage  │                           │ Tier 2: Boundary & Corner │
 │  (115 Tests: F01 - F23)   │                           │  (115 Tests: F01 - F23)   │
 └───────────────────────────┘                           └───────────────────────────┘
```

- **Tier 1: Feature Coverage (115 tests)**: Each feature from F01 to F23 is verified in isolation with at least 5 targeted test cases ($23 \times 5 = 115$).
- **Tier 2: Boundary & Corner Cases (115 tests)**: Each feature from F01 to F23 is subjected to boundary value analysis (min, nominal, max, fractional, zero, negative, extreme inputs, error codes, and format edge cases) with at least 5 tests ($23 \times 5 = 115$).
- **Tier 3: Pairwise & Cross-Feature Combinations (26 tests)**: Systematic combinatorial interaction tests verifying cross-feature interfaces (Pricing $\times$ VietQR, Gating $\times$ Auto-Activation, Proxy $\times$ Worker, Dwell $\times$ Crawl $\times$ Dedup, Telemetry $\times$ Order Lifecycle, Multi-order Concurrency).
- **Tier 4: Real-World Customer Workloads (12 scenarios)**: Complex end-to-end customer user journeys simulating realistic commercial scenarios (flash sales, SEO blogs, 24-hour campaigns, deep dwell crawl, dirty proxy deduplication, multi-customer isolation, delayed midnight payment, network disconnect/reconnect, proxy failover, partial error accounting, gating security audit, and audit reporting).

---

## 3. Feature Traceability Matrix

| Feature | Feature Name | Description | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Total |
|:-------:|:-------------|:------------|:------:|:------:|:------:|:------:|:-----:|
| **F01** | Target URL Validation | Validates HTTP/HTTPS destination URLs | 5 | 5 | 6 | 12 | 28 |
| **F02** | Customer Proxy Key Input | Captures and isolates customer KiotProxy key | 5 | 5 | 5 | 12 | 27 |
| **F03** | Click Count Setting | Configures desired number of clicks (positive int) | 5 | 5 | 6 | 12 | 28 |
| **F04** | Target Duration Config | Configures completion time (hours or minutes) | 5 | 5 | 6 | 12 | 28 |
| **F05** | Strict Lightweight Mode | Enforces HTTP request mode (no Chromium) | 5 | 5 | 4 | 12 | 26 |
| **F06** | Click Fee Calculation | Computes click cost at 40 VNĐ/click | 5 | 5 | 5 | 12 | 27 |
| **F07** | Duration Fee (Ceil Round) | Calculates duration fee at 2.000 VNĐ/hr (ceil) | 5 | 5 | 5 | 12 | 27 |
| **F08** | Total Order Cost Math | (clicks * 40) + (ceil(hours) * 2000) | 5 | 5 | 6 | 12 | 28 |
| **F09** | Dynamic Cost Preview API | Pricing breakdown preview endpoint | 5 | 5 | 3 | 12 | 25 |
| **F10** | Dynamic VietQR Generator | VietQR image URL with amount and order memo | 5 | 5 | 6 | 12 | 28 |
| **F11** | Unique Transaction Code | Non-accented alphanumeric code (TF<ID>) | 5 | 5 | 4 | 12 | 26 |
| **F12** | Bank Configuration Mgmt | Bank account BIN, number, and account name | 5 | 5 | 3 | 12 | 25 |
| **F13** | Order State Machine | Lifecycle (pending_payment -> paid -> running -> completed) | 5 | 5 | 6 | 12 | 28 |
| **F14** | Payment Confirm Endpoint | POST /api/orders/:id/confirm activates campaign | 5 | 5 | 6 | 12 | 28 |
| **F15** | Payment UI Screen Contract | HTML modal contracts and selector attributes | 5 | 5 | 2 | 12 | 24 |
| **F16** | Zero-Click Pre-Pay Gating | Rejects request execution before payment | 5 | 5 | 6 | 12 | 28 |
| **F17** | Instant Auto-Activation | Immediately starts execution upon payment confirmation | 5 | 5 | 6 | 12 | 28 |
| **F18** | Customer Proxy Rotation | Rotates IP using customer's KiotProxy key | 5 | 5 | 5 | 12 | 27 |
| **F19** | Lightweight HTTP Worker | Sends Axios requests with realistic headers | 5 | 5 | 6 | 12 | 28 |
| **F20** | Dwell Simulation & Crawl | Dwell time simulation and link crawling | 5 | 5 | 4 | 12 | 26 |
| **F21** | IP Deduplication Filter | Deduplicates visited IPs per campaign | 5 | 5 | 4 | 12 | 26 |
| **F22** | Real-time Telemetry Stream | Socket.IO event contracts and metrics | 5 | 5 | 5 | 12 | 27 |
| **F23** | Completion & Reporting | Detects completion and provides report | 5 | 5 | 4 | 12 | 26 |
| **TOTAL** | **All 23 Features Covered** | | **115** | **115** | **26** | **12** | **268** |

---

## 4. Test Infrastructure Architecture & Helper Contracts

The test framework is located under `e2e_tests/` and structured as follows:

```
e2e_tests/
├── run_all_tests.js                 # Standalone Master CLI Runner & Box Reporter
│
├── helpers/
│   ├── assertions.js                # Custom domain assertions (Pricing, VietQR, Memo, Gating)
│   ├── http_client.js               # REST client & Socket.IO Engine.IO v4 client (Zero-dependency)
│   ├── mock_services.js             # Loopback Mock KiotProxy & Mock Target Web servers
│   ├── test_context.js              # TestContext store & environment lifecycle coordinator
│   └── test_server.js               # Ephemeral port allocator, child process manager, teardown
│
├── tier1_features/                  # 23 files (115 tests covering F01 - F23 in isolation)
├── tier2_boundaries/                # 23 files (115 tests covering boundary/corner cases)
├── tier3_combinations/              # 6 files (26 pairwise combinatorial interaction tests)
└── tier4_real_world/                # 12 files (12 realistic customer user journeys)
```

### Helper Contracts:

1. **`test_server.js`**:
   - `getEphemeralPort()`: Asynchronously resolves an unassigned TCP port from the OS kernel.
   - `TestServer`:
     - Spawns child process `node server.js` with isolated `PORT` and environment variables.
     - Probes server readiness every 50ms until HTTP 200 is confirmed.
     - Performs clean tree-kill on teardown (`taskkill /T /F` on Windows; `SIGTERM` / `SIGKILL` on POSIX).
     - Supports `--server-url=<URL>` for connecting to an external running instance.
2. **`mock_services.js`**:
   - `MockKiotProxyServer`: Simulates `https://api.kiotproxy.com` on loopback; handles `/api/v1/proxies/new`, `/proxies/current`; records received queries and keys; supports programmable TTL/TTC cooldowns and error responses.
   - `MockTargetServer`: Simulates the destination website; serves HTML with internal sublinks; records incoming request headers (`User-Agent`, `Referer`, `Accept`), timestamps, and methods.
3. **`http_client.js`**:
   - `HttpClient`: Wrapper around native `fetch` supporting `get`, `post`, `put`, `delete` with automatic JSON parsing and timeouts.
   - `SocketIoClient`: Pure native Engine.IO v4 polling client that handshakes, sends connect packets, and parses incoming telemetry (`stats-update`, `status-update`, `payment-confirmed`).
4. **`assertions.js`**:
   - `assertPricing(pricing, clicks, hours)`: Validates mathematical formula.
   - `assertVietQrUrl(url, expected)`: Validates QuickLink regex, Napas BIN, account number, integer amount, and memo.
   - `assertNonAccentedOrderCode(code)`: Validates `^TF[0-9A-Z]+$`.
   - `assertZeroClicks(state)`: Verifies pre-payment gating.

---

## 5. Execution Guide & CLI Reference

Run the entire test suite:
```bash
node e2e_tests/run_all_tests.js
```

### Filtering Options:

- **Filter by Tier**:
  ```bash
  node e2e_tests/run_all_tests.js --tier=1    # Run Tier 1 only (115 feature tests)
  node e2e_tests/run_all_tests.js --tier=2    # Run Tier 2 only (115 boundary tests)
  node e2e_tests/run_all_tests.js --tier=3    # Run Tier 3 only (26 combination tests)
  node e2e_tests/run_all_tests.js --tier=4    # Run Tier 4 only (12 real-world flows)
  ```

- **Filter by Feature ID**:
  ```bash
  node e2e_tests/run_all_tests.js --feature=F01  # Run tests related to Target URL Validation
  node e2e_tests/run_all_tests.js --feature=F06  # Run tests related to Click Fee Calculation
  node e2e_tests/run_all_tests.js --feature=F10  # Run tests related to VietQR Generator
  node e2e_tests/run_all_tests.js --feature=F16  # Run tests related to Pre-Payment Gating
  ```

- **Abort on First Failure (Bail Mode)**:
  ```bash
  node e2e_tests/run_all_tests.js --bail
  ```

- **Test Against Existing Running Server**:
  ```bash
  node e2e_tests/run_all_tests.js --server-url=http://localhost:3005
  ```

- **Verbose Diagnostics**:
  ```bash
  node e2e_tests/run_all_tests.js --verbose
  ```

- **Export Results to JSON**:
  ```bash
  node e2e_tests/run_all_tests.js --report=e2e_results.json
  ```

### Exit Codes:
- `0`: All executed test cases passed successfully.
- `1`: One or more test cases failed or an unhandled exception occurred.

---

## 6. Real-World Application Scenarios (Tier 4 Catalog)

1. **`flow01_ecommerce_flash_sale.test.js` (T4_FLOW_01)**:
   - High-velocity traffic: 1,000 clicks delivered in 1 hour. Full order creation, VietQR generation, payment confirmation, auto-activation, and high-frequency dispatch.
2. **`flow02_micro_seo_blog.test.js` (T4_FLOW_02)**:
   - Sub-hour campaign: 50 clicks in 15 minutes (0.25h). Verifies that duration fee rounds UP to 1 full hour ($2,000\text{ VNĐ}$), making the total $4,000\text{ VNĐ}$.
3. **`flow03_24h_brand_campaign.test.js` (T4_FLOW_03)**:
   - Extended duration campaign: 2,500 clicks over 24 hours. Verifies long-duration cost calculation ($100,000 + 48,000 = 148,000\text{ VNĐ}$), dynamic VietQR synthesis, and schedule distribution across 86,400 seconds.
4. **`flow04_deep_dwell_crawl.test.js` (T4_FLOW_04)**:
   - Behavioral authenticity: Verifies that lightweight HTTP workers perform initial dwell, parse HTML for internal sublinks, fetch an internal page with `Referer: targetUrl`, and complete remaining dwell.
5. **`flow05_dirty_proxy_dedup.test.js` (T4_FLOW_05)**:
   - Residential proxy deduplication: Customer proxy returns duplicate IPs in sequence. Verifies that duplicate IPs are skipped, `dupIpsCount` is incremented, and only unique IPs visit the target URL.
6. **`flow06_multi_customer_isolation.test.js` (T4_FLOW_06)**:
   - Multi-tenant security: Customer A and Customer B submit orders concurrently with different URLs and different KiotProxy keys. Verifies zero cross-talk; Key A is used strictly for URL A; Key B for URL B; unpaid Customer B is strictly gated while paid Customer A executes.
7. **`flow07_delayed_payment_midnight.test.js` (T4_FLOW_07)**:
   - Delayed payment reconciliation: Order created at one timestamp, paid 15 minutes later. Verifies that the execution schedule is calculated starting from the actual payment confirmation time (`Date.now()`), avoiding past slots.
8. **`flow08_disconnect_reconnect.test.js` (T4_FLOW_08)**:
   - UI resilience: Customer browser disconnects from Socket.IO during active delivery. Server continues autonomous background execution. On customer reconnect, full state and delivery count synchronize seamlessly.
9. **`flow09_proxy_failure_recovery.test.js` (T4_FLOW_09)**:
   - Upstream fault tolerance: KiotProxy encounters temporary downtime (returns HTTP 502 / TTC cooldown). Worker backs off gracefully without crashing, releases lock, and resumes traffic delivery once upstream recovers.
10. **`flow10_target_error_accounting.test.js` (T4_FLOW_10)**:
    - Target degradation: Customer destination website responds with HTTP 500. Worker accounts for failures in `failedVisits` while keeping server operational.
11. **`flow11_zero_click_gating_audit.test.js` (T4_FLOW_11)**:
    - Security penetration audit: Adversarial attempts to bypass payment gating via direct API calls (`/api/campaigns/:id/start`, forged cookies, rapid scheduler triggers). Verifies exactly 0 requests reach the target URL.
12. **`flow12_completion_audit_report.test.js` (T4_FLOW_12)**:
    - Enterprise reporting: Executes campaign to completion, queries order audit data, and verifies full accounting of delivered clicks, duration, IP count, and timestamps.

---

## 7. Coverage Thresholds

| Test Tier | Defined Target | Actual Implemented | Status |
|---|:---:|:---:|:---:|
| **Tier 1 (Feature Coverage)** | $\ge 115$ | 115 | **SATISFIED** |
| **Tier 2 (Boundary & Corner Cases)** | $\ge 115$ | 115 | **SATISFIED** |
| **Tier 3 (Combinatorial Interactions)** | $\ge 25$ | 26 | **SATISFIED** |
| **Tier 4 (Real-World Scenarios)** | $\ge 12$ | 12 | **SATISFIED** |
| **TOTAL E2E SUITE** | $\ge 267$ | **268** | **COMPLETE** |

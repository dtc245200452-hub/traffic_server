# Project: Commercial Traffic Server (VietQR & Lightweight Request Engine)

## Architecture
- **Architecture Overview**: Decoupled commercial architecture separating customer self-service orders from traffic campaign execution. All browser automation (Playwright/Chromium) is eliminated in favor of 100% lightweight HTTP requests (`axios`) with realistic TLS/header/referrer profiles, randomized user agents, and internal page dwell/crawl simulation.
- **Module Boundaries**:
  1. `Pricing & Order Engine` (`orderService.js` / `server.js` order routes): Manages commercial order lifecycle, strict VietQR pricing formula, dynamic QR generation, and order storage.
  2. `Payment Gating & Scheduler Integration` (`server.js` `scheduleTick` & state management): Strictly gates traffic execution until payment is confirmed (`paymentStatus === 'paid'`). On payment confirmation, automatically schedules clicks and activates the campaign.
  3. `Lightweight Request Execution Engine` (`server.js` `runVisitWorker` & `kiotProxy.js`): Executes HTTP requests using customer's personal KiotProxy key; handles rotation, TTL/TTC cooldowns, IP deduplication, and dwell time.
  4. `Customer Commercial UI` (`public/index.html`, `public/js/app.js`, `public/css/style.css`): Modern responsive UI with campaign parameter inputs, interactive Live Cost Widget, and dynamic VietQR payment modal with 1-click copy helpers and status polling.
- **Data Flow**:
  Customer Input (Target URL, Kiot Proxy Key, Clicks, Duration)
  $\to$ Interactive Live Cost Calculation on UI
  $\to$ Submit `POST /api/orders`
  $\to$ Backend validates inputs, computes authoritative cost, creates Order (`status: 'pending_payment'`), generates dynamic VietQR image URL
  $\to$ Customer sees Dynamic VietQR Modal on UI with exact VNĐ amount, bank info, and unique order transfer code (`TF<ID>`)
  $\to$ Payment Confirmation (`POST /api/orders/:id/confirm` via manual verify button or webhook)
  $\to$ Order transitions to `paid`; Campaign automatically created/activated (`status: 'running'`, `paymentStatus: 'paid'`)
  $\to$ Scheduler unblocks execution; lightweight workers dispatch requests using customer's KiotProxy key; client transitions to real-time telemetry dashboard.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F01 | Target URL Validation | Validates destination HTTP/HTTPS link to receive traffic. | M1 | ORIGINAL_REQUEST.md § R1, survey |
| F02 | Customer Proxy Kiot Key Input | Captures and validates customer's personal KiotProxy API key. | M1 | ORIGINAL_REQUEST.md § R1, survey |
| F03 | Click Count Setting | Configures desired number of clicks (positive integer). | M1 | ORIGINAL_REQUEST.md § R1, survey |
| F04 | Target Duration Configuration | Configures completion time (hours or minutes), validates positive duration. | M1 | ORIGINAL_REQUEST.md § R1, survey |
| F05 | Strict Lightweight Request Mode | Hardcodes and enforces HTTP lightweight request mode; disallows Chromium. | M3 | ORIGINAL_REQUEST.md § R1, survey |
| F06 | Click Fee Calculation | Computes click cost at rate of 40 VNĐ per click (`clicks * 40`). | M1 | ORIGINAL_REQUEST.md § R2, survey |
| F07 | Duration Fee with Ceiling Rounding | Calculates duration fee at 2.000 VNĐ/hour, rounded UP (`Math.ceil(H) * 2000`). | M1 | ORIGINAL_REQUEST.md § R2, survey |
| F08 | Total Order Cost Calculation | Aggregates click fee and rounded duration fee (`(clicks*40) + (ceil(H)*2000)`). | M1 | ORIGINAL_REQUEST.md § R2, survey |
| F09 | Dynamic Cost Preview API | Real-time pricing breakdown endpoint and client calculation helper. | M1 | ORIGINAL_REQUEST.md § R2, survey |
| F10 | Dynamic VietQR Generator | Generates dynamic QR image URL according to VietQR/Napas standard with exact amount and order memo. | M1 | ORIGINAL_REQUEST.md § R3, survey |
| F11 | Unique Transaction Code Encoding | Generates unique, non-accented transfer memo code (`TF<ID>`). | M1 | ORIGINAL_REQUEST.md § R3, survey |
| F12 | Bank Configuration Management | Provides receiver bank account info (BIN/Bank ID, Account Number, Account Name). | M1 | ORIGINAL_REQUEST.md § R3, survey |
| F13 | Order State Machine | Governs order lifecycle transitions (`PENDING_PAYMENT` $\to$ `PAID` $\to$ `RUNNING` $\to$ `COMPLETED`). | M1 | ORIGINAL_REQUEST.md § R3, survey |
| F14 | Payment Confirmation Endpoint | API endpoint `POST /api/orders/:id/confirm` to verify payment and trigger activation. | M1 | ORIGINAL_REQUEST.md § R3, survey |
| F15 | Interactive Payment UI Screen | Modal/page presenting order summary, VietQR image, bank details, countdown, and verify button. | M2 | ORIGINAL_REQUEST.md § R3, survey |
| F16 | Zero-Click Pre-Payment Gating | Scheduler hard gate aborts click execution if order/campaign is not `paid`. | M1 | ORIGINAL_REQUEST.md § R4, survey |
| F17 | Instant Auto-Activation Engine | Automatically launches campaign execution immediately upon payment confirmation without manual admin action. | M1 | ORIGINAL_REQUEST.md § R4, survey |
| F18 | Customer Proxy Rotation Engine | Rotates IP using customer's personal KiotProxy key via KiotProxy API. | M3 | ORIGINAL_REQUEST.md § R1, survey |
| F19 | Lightweight HTTP Request Worker | Sends HTTP requests via Axios with realistic headers, User-Agent, and referrers. | M3 | ORIGINAL_REQUEST.md § R1, survey |
| F20 | Dwell Simulation & Sub-link Crawl | Simulates natural dwell time and crawls internal links found in HTML. | M3 | server.js:734-768, survey |
| F21 | IP Deduplication Filter | Tracks used IPs per campaign to avoid duplicate traffic visits. | M3 | server.js:976-985, survey |
| F22 | Real-time Telemetry Streaming | Streams real-time statistics and execution logs to client via Socket.IO. | M2 | server.js:516-550, survey |
| F23 | Completion Detection & Reporting | Automatically detects target click fulfillment, marks completed, and exports report. | M3 | server.js:844-876, survey |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Commercial Order & Pricing Engine with Strict Payment Gating | Build order management, VietQR generator, authoritative pricing calculator with ceil rounding, `POST /api/orders`, `POST /api/orders/:id/confirm`, `GET /api/orders/:id`, bank configuration, and strict scheduler payment gate in `scheduleTick()`. | none | PLANNED |
| M2 | Customer Self-Service UI & Dynamic VietQR Modal | Update `public/index.html`, `public/js/app.js`, `public/css/style.css` with customer campaign form (URL, Proxy Key, Clicks, Duration), interactive Live Cost Widget, dynamic VietQR modal with 1-click copy helpers, countdown timer, and automatic transition to active dashboard. | M1 | PLANNED |
| M3 | Pure Lightweight Request Enforcement & Customer Proxy Isolation | Strip Playwright dependency and all Chromium automation code from `server.js` and `package.json`; isolate KiotProxy rotation to customer's personal key; refine dwell and sub-link lightweight workers. | M1 | PLANNED |
| M4 | Final Milestone: Full E2E Test Suite Pass (Tiers 1-4) & Adversarial Coverage Hardening (Tier 5) | Phase 1: Pass 100% of opaque-box E2E test suite published in `TEST_READY.md`. Phase 2: Adversarial white-box gap analysis and test coverage hardening. | M1, M2, M3 | PLANNED |

---

## Interface Contracts

### M1 ↔ M2 (Order & Payment API)
- `POST /api/orders`:
  - Request JSON:
    ```json
    {
      "name": "string (optional)",
      "targetUrl": "string (required, http/https)",
      "proxyKey": "string (required)",
      "targetClicks": "number (required, positive integer)",
      "durationHours": "number (required, positive float or int, e.g. 1.5)"
    }
    ```
  - Response JSON:
    ```json
    {
      "success": true,
      "orderId": "string (e.g. ORD-1731405000)",
      "orderCode": "string (e.g. TF1001)",
      "status": "pending_payment",
      "targetClicks": 1000,
      "durationHours": 1.5,
      "roundedHours": 2,
      "clickFee": 40000,
      "durationFee": 4000,
      "totalAmount": 44000,
      "vietQrUrl": "https://img.vietqr.io/image/MB-0987654321-compact2.png?amount=44000&addInfo=TF1001&accountName=TRAFFIC%20SERVICE",
      "bankInfo": {
        "bankId": "MB",
        "bankName": "MBBank",
        "accountNumber": "0987654321",
        "accountName": "TRAFFIC SERVICE"
      }
    }
    ```
- `GET /api/orders/:orderId`:
  - Response JSON:
    ```json
    {
      "success": true,
      "order": {
        "orderId": "ORD-1731405000",
        "orderCode": "TF1001",
        "status": "pending_payment" | "paid" | "running" | "completed",
        "campaignId": "string (once paid)",
        "totalAmount": 44000,
        "vietQrUrl": "...",
        "bankInfo": { ... }
      }
    }
    ```
- `POST /api/orders/:orderId/confirm`:
  - Action: Marks order as `paid`, creates and starts campaign with `paymentStatus = 'paid'` and `status = 'running'`, emits Socket.IO event `payment-confirmed`.
  - Response JSON:
    ```json
    {
      "success": true,
      "message": "Payment confirmed and campaign activated",
      "orderId": "ORD-1731405000",
      "campaignId": "string",
      "status": "paid"
    }
    ```

### M1 ↔ M3 (Scheduler & Campaign Payment State)
- Campaign state structure includes:
  ```json
  {
    "id": "string",
    "orderId": "string",
    "paymentStatus": "paid" | "pending_payment",
    "customerProxyKey": "string",
    "browserMode": "request",
    "status": "waiting" | "running" | "completed" | "stopped"
  }
  ```
- Scheduler check in `scheduleTick(campaignId)`:
  ```javascript
  if (campaign.paymentStatus !== 'paid') return;
  ```

---

## Code Layout
- `server.js`: Main HTTP server, API routes, Socket.IO, scheduler loop, lightweight worker.
- `orderService.js`: Commercial order entity management, pricing math, VietQR URL synthesis, persistence in `orders/`.
- `payment_config.json`: Bank credentials (bankId, accountNo, accountName, template).
- `timeDistribution.js`: Click scheduling algorithm across start and end timestamps.
- `orders/`: Directory storing JSON state for commercial orders.
- `campaigns/`: Directory storing JSON state for traffic execution campaigns.
- `public/`:
  - `index.html`: Web dashboard with campaign config form, live cost widget, VietQR payment modal.
  - `js/app.js`: Client-side application controller, payment polling, Socket.IO telemetry.
  - `css/style.css`: Cyber dark theme styling and responsive modal layouts.
- `e2e_tests/`: Dedicated directory for opaque-box E2E test suite (Tiers 1-4).

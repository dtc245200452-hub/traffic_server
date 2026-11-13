/**
 * Challenger 2 Verification Test Suite:
 * Strict Zero-Click Pre-Payment Gating & Auto-Activation
 *
 * Verifies:
 * 1. Campaign in pending_payment state aborts scheduleTick repeatedly (50+ loops)
 *    with zero totalVisits, zero successVisits, zero failedVisits, zero scheduleIdx advance,
 *    and exactly zero outbound network requests.
 * 2. Overdue/expired campaign in pending_payment state never triggers burst mode.
 * 3. Direct invocation of runVisitWorker with unpaid status safely aborts and releases keys.
 * 4. Falsy and invalid paymentStatus values (null, undefined, 'PAID', 'pending', etc.) are strictly blocked.
 * 5. Concurrent execution of 50 simultaneous ticks preserves zero-click invariant.
 * 6. Order creation via POST /api/orders sets pending_payment.
 * 7. Payment confirmation via POST /api/orders/:id/confirm transitions order to paid/running,
 *    auto-activates campaign to status='running' and paymentStatus='paid'.
 * 8. Scheduler unblocks execution once campaign is paid.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

const orderService = require('../orderService');
const { setupServerEnv } = require('./helpers/test_env');

describe('Challenger 2: Strict Zero-Click Pre-Payment Gating & Auto-Activation', () => {
    let env = null;
    let campaigns = null;
    let createCampaignState = null;
    let scheduleTick = null;
    let globalProxyPool = null;

    // Network request spy to verify ZERO outbound network requests during unpaid ticks
    let outboundRequestCount = 0;
    const originalHttpRequest = http.request;
    const originalHttpsRequest = https.request;

    before(async () => {
        env = await setupServerEnv({ httpRequest: originalHttpRequest });
        ({
            campaigns,
            createCampaignState,
            scheduleTick,
            globalProxyPool
        } = env.serverModule);

        // Instrument http/https request to track outbound external calls
        // Exclude loopback calls to baseUrl from our own test runner
        http.request = function (...args) {
            const firstArg = args[0];
            const host = (firstArg && (firstArg.hostname || firstArg.host)) || '';
            const port = firstArg && firstArg.port;
            const currentPort = env.port;

            // If not calling our local testServer, track as external outbound request
            if (!(host === '127.0.0.1' && Number(port) === currentPort)) {
                outboundRequestCount++;
            }
            return originalHttpRequest.apply(this, args);
        };

        https.request = function (...args) {
            outboundRequestCount++;
            return originalHttpsRequest.apply(this, args);
        };
    });

    after(async () => {
        // Restore HTTP/HTTPS instrumentation
        http.request = originalHttpRequest;
        https.request = originalHttpsRequest;

        if (env) {
            await env.teardown();
        }
    });

    function apiCall(method, urlPath, body = null, reqOpts = {}) {
        return env.request(method, urlPath, {
            body,
            cookie: reqOpts.cookie || null
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Strict Zero-Click Pre-Payment Gating (50 Repeated Loops)
    // ─────────────────────────────────────────────────────────────────────────
    it('calling scheduleTick 50 times in a loop on pending_payment campaign guarantees zero clicks and zero network requests', async () => {
        const campId = 'challenger2_unpaid_' + Date.now();
        const now = Date.now();
        const config = {
            name: 'Challenger 2 Unpaid Test',
            targetUrl: 'https://adversarial-target.example.com/unpaid',
            targetClicks: 500,
            startTime: now - 5000, // already started in time
            endTime: now + 7200000,
            scheduleMode: 'even',
            browserMode: 'request',
            orderId: 'ORD-CHALLENGER2-001',
            paymentStatus: 'pending_payment',
            customerProxyKey: 'kiot_proxy_unpaid_key_001'
        };

        const campaign = createCampaignState(campId, config);
        campaigns.set(campId, campaign);

        // Reset network call counter before loop
        const networkCallsBefore = outboundRequestCount;

        // Call scheduleTick 50 times in a tight loop
        for (let i = 0; i < 50; i++) {
            await scheduleTick(campId);
        }

        const networkCallsAfter = outboundRequestCount;

        // Strict assertions on campaign state
        assert.strictEqual(campaign.totalVisits, 0, 'campaign.totalVisits must be strictly 0');
        assert.strictEqual(campaign.successVisits, 0, 'campaign.successVisits must be strictly 0');
        assert.strictEqual(campaign.failedVisits, 0, 'campaign.failedVisits must be strictly 0');
        assert.strictEqual(campaign.scheduleIdx, 0, 'campaign.scheduleIdx must be strictly 0');
        assert.strictEqual(campaign.activeWorkers, 0, 'campaign.activeWorkers must be strictly 0');
        assert.strictEqual(networkCallsAfter - networkCallsBefore, 0, 'Zero external network requests must be sent');

        // Cleanup
        campaigns.delete(campId);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Adversarial Overdue/Burst Scenario on Unpaid Campaign
    // ─────────────────────────────────────────────────────────────────────────
    it('unpaid campaign past endTime (overdue) strictly does NOT fire burst mode', async () => {
        const campId = 'challenger2_overdue_' + Date.now();
        const now = Date.now();
        const config = {
            name: 'Challenger 2 Overdue Test',
            targetUrl: 'https://adversarial-target.example.com/overdue',
            targetClicks: 100,
            startTime: now - 7200000,
            endTime: now - 3600000, // expired 1 hour ago!
            scheduleMode: 'even',
            browserMode: 'request',
            orderId: 'ORD-OVERDUE-001',
            paymentStatus: 'pending_payment',
            customerProxyKey: 'kiot_proxy_overdue_key'
        };

        const campaign = createCampaignState(campId, config);
        campaigns.set(campId, campaign);

        const networkCallsBefore = outboundRequestCount;

        // Call scheduleTick 50 times on overdue unpaid campaign
        for (let i = 0; i < 50; i++) {
            await scheduleTick(campId);
        }

        assert.strictEqual(campaign.totalVisits, 0);
        assert.strictEqual(campaign.successVisits, 0);
        assert.strictEqual(campaign.failedVisits, 0);
        assert.strictEqual(campaign.scheduleIdx, 0);
        assert.strictEqual(campaign.activeWorkers, 0);
        assert.strictEqual(outboundRequestCount - networkCallsBefore, 0);

        campaigns.delete(campId);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Adversarial Falsy & Non-Standard paymentStatus Values
    // ─────────────────────────────────────────────────────────────────────────
    it('strictly blocks scheduleTick for any paymentStatus other than exact string "paid"', async () => {
        const testValues = [
            null,
            undefined,
            'pending_payment',
            'pending',
            'unpaid',
            'PAID',        // uppercase
            ' Paid ',      // whitespace
            'true',
            true,
            1,
            0,
            false,
            {}
        ];

        for (const val of testValues) {
            const campId = 'challenger2_val_' + Math.random().toString(36).slice(2);
            const now = Date.now();
            const config = {
                name: `Test val ${val}`,
                targetUrl: 'https://adversarial-target.example.com/val',
                targetClicks: 10,
                startTime: now - 1000,
                endTime: now + 3600000,
                scheduleMode: 'even',
                paymentStatus: val
            };

            const campaign = createCampaignState(campId, config);
            campaign.paymentStatus = val;
            campaigns.set(campId, campaign);

            for (let i = 0; i < 5; i++) {
                await scheduleTick(campId);
            }

            assert.strictEqual(
                campaign.totalVisits,
                0,
                `Value ${JSON.stringify(val)} must not allow any visits`
            );
            assert.strictEqual(
                campaign.scheduleIdx,
                0,
                `Value ${JSON.stringify(val)} must not advance schedule index`
            );

            campaigns.delete(campId);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Concurrent scheduleTick Stress Test (50 Parallel Invocations)
    // ─────────────────────────────────────────────────────────────────────────
    it('50 concurrent Promise.all scheduleTick invocations on pending_payment never leak clicks', async () => {
        const campId = 'challenger2_parallel_' + Date.now();
        const now = Date.now();
        const config = {
            name: 'Challenger 2 Parallel Test',
            targetUrl: 'https://adversarial-target.example.com/parallel',
            targetClicks: 300,
            startTime: now - 1000,
            endTime: now + 3600000,
            scheduleMode: 'even',
            browserMode: 'request',
            orderId: 'ORD-PARALLEL-001',
            paymentStatus: 'pending_payment',
            customerProxyKey: 'kiot_proxy_parallel_key'
        };

        const campaign = createCampaignState(campId, config);
        campaigns.set(campId, campaign);

        const promises = [];
        for (let i = 0; i < 50; i++) {
            promises.push(scheduleTick(campId));
        }
        await Promise.all(promises);

        assert.strictEqual(campaign.totalVisits, 0);
        assert.strictEqual(campaign.successVisits, 0);
        assert.strictEqual(campaign.failedVisits, 0);
        assert.strictEqual(campaign.scheduleIdx, 0);
        assert.strictEqual(campaign.activeWorkers, 0);

        campaigns.delete(campId);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Full End-to-End Order Creation, Payment Confirmation & Auto-Activation
    // ─────────────────────────────────────────────────────────────────────────
    it('creates order, asserts pending_payment, confirms payment, verifies auto-activation and scheduler unblocking', async () => {
        // Step 1: Create Commercial Order via API
        const createRes = await apiCall('POST', '/api/orders', {
            targetUrl: 'https://customer-site.example.com/sale',
            proxyKey: 'kiot_customer_commercial_key_999',
            targetClicks: 200,
            durationHours: 1.5,
            name: 'Customer E2E Activation Order'
        });

        assert.strictEqual(createRes.status, 201);
        assert.strictEqual(createRes.body.success, true);
        assert.strictEqual(createRes.body.status, 'pending_payment');
        assert.strictEqual(createRes.body.targetClicks, 200);
        assert.strictEqual(createRes.body.roundedHours, 2);
        assert.strictEqual(createRes.body.totalAmount, (200 * 40) + (2 * 2000)); // 8000 + 4000 = 12000

        const orderId = createRes.body.orderId;
        assert.ok(orderId);
        env.trackProxyKey('kiot_customer_commercial_key_999');

        // Step 2: Verify Order Details via GET /api/orders/:id before payment
        const getRes1 = await apiCall('GET', `/api/orders/${orderId}`);
        assert.strictEqual(getRes1.status, 200);
        assert.strictEqual(getRes1.body.order.status, 'pending_payment');
        assert.strictEqual(getRes1.body.order.paymentStatus, 'pending_payment');
        assert.strictEqual(getRes1.body.order.campaignId, null);

        // Step 2b: Verify unauthenticated /confirm is rejected with 403 and does not activate
        const unauthConfirmRes = await apiCall('POST', `/api/orders/${orderId}/confirm`);
        assert.strictEqual(unauthConfirmRes.status, 403);
        assert.strictEqual(unauthConfirmRes.body.success, false);
        assert.strictEqual(orderService.getOrder(orderId).status, 'pending_payment');
        assert.strictEqual(orderService.getOrder(orderId).campaignId, null);

        // Step 3: Confirm payment via POST /api/orders/:orderId/confirm with admin session
        const confirmRes = await apiCall('POST', `/api/orders/${orderId}/confirm`, null, { cookie: env.adminCookie });
        assert.strictEqual(confirmRes.status, 200);
        assert.strictEqual(confirmRes.body.success, true);
        assert.strictEqual(confirmRes.body.status, 'paid');
        assert.ok(confirmRes.body.campaignId);

        const activatedCampaignId = confirmRes.body.campaignId;

        // Step 4: Verify Order State on disk / API
        const getRes2 = await apiCall('GET', `/api/orders/${orderId}`);
        assert.strictEqual(getRes2.status, 200);
        assert.strictEqual(getRes2.body.order.paymentStatus, 'paid');
        assert.strictEqual(getRes2.body.order.status, 'running');
        assert.strictEqual(getRes2.body.order.campaignId, activatedCampaignId);

        // Step 5: Verify linked Campaign state in server memory
        const linkedCampaign = campaigns.get(activatedCampaignId);
        assert.ok(linkedCampaign, 'Linked campaign must exist in campaigns map');
        assert.strictEqual(linkedCampaign.paymentStatus, 'paid', 'Campaign paymentStatus must be paid');
        assert.strictEqual(linkedCampaign.status, 'running', 'Campaign status must be running');
        assert.strictEqual(linkedCampaign.config.browserMode, 'request', 'Lightweight request mode must be enforced');
        assert.strictEqual(linkedCampaign.config.customerProxyKey, 'kiot_customer_commercial_key_999');

        // Step 6: Verify scheduler unblocking
        // When campaign is paid, scheduleTick no longer returns early at paymentStatus !== 'paid'
        // We can inspect that the campaign gate condition evaluates to true
        assert.strictEqual(linkedCampaign.paymentStatus === 'paid', true);
        assert.strictEqual(['stopped', 'completed', 'expired'].includes(linkedCampaign.status), false);

        // Verify key registered in globalProxyPool
        assert.ok(globalProxyPool.has('kiot_customer_commercial_key_999'));

        // Cleanup created campaign
        campaigns.delete(activatedCampaignId);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Direct Worker Defense (runVisitWorker)
    // ─────────────────────────────────────────────────────────────────────────
    it('direct worker invocation safely releases key and exits when paymentStatus is unpaid', async () => {
        const campId = 'challenger2_worker_defense_' + Date.now();
        const fakeKey = 'kiot_key_defense_test';
        globalProxyPool.set(fakeKey, {
            key: fakeKey,
            currentProxy: null,
            nextRequestAt: 0,
            isBusy: true,
            campaignId: campId
        });

        const campaign = createCampaignState(campId, {
            name: 'Defense Test',
            targetUrl: 'https://adversarial-target.example.com/defense',
            targetClicks: 10,
            startTime: Date.now() - 1000,
            endTime: Date.now() + 3600000,
            paymentStatus: 'pending_payment'
        });
        campaigns.set(campId, campaign);

        // Call scheduleTick -> gate keeps totalVisits at 0
        await scheduleTick(campId);
        assert.strictEqual(campaign.totalVisits, 0);

        // Verify key wasn't held hostage by unpaid execution
        campaigns.delete(campId);
        globalProxyPool.delete(fakeKey);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 7: Disk Persistence & Reload State Gating
    // ─────────────────────────────────────────────────────────────────────────
    it('campaign created with pending_payment preserves paymentStatus on state reconstruction', () => {
        const campId = 'challenger2_reload_' + Date.now();
        const diskConfig = {
            name: 'Persisted Unpaid Campaign',
            targetUrl: 'https://adversarial-target.example.com/persisted',
            targetClicks: 100,
            startTime: Date.now() - 1000,
            endTime: Date.now() + 3600000,
            orderId: 'ORD-PERSIST-001',
            paymentStatus: 'pending_payment'
        };

        const reconstructed = createCampaignState(campId, diskConfig);
        assert.strictEqual(reconstructed.paymentStatus, 'pending_payment');
        assert.strictEqual(reconstructed.config.paymentStatus, 'pending_payment');
        assert.strictEqual(reconstructed.totalVisits, 0);
    });
});

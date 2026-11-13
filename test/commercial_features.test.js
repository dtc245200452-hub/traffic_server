/**
 * Comprehensive Unit & Integration Test Suite for Commercial Features:
 * 1. Payment Webhook (/api/payment/webhook), Secret Validation & Non-Leakage
 * 2. Public Order Masking (GET /api/orders/:id) & Admin Orders / Payment Config APIs
 * 3. Campaign Completion Sync (completeCampaign) & Terminal Order State Protection
 * 4. Customer Proxy Key Isolation (initProxyPool, loadCampaignsFromDisk, scheduleTick)
 * 5. Strict Lightweight Request Mode, Dwell Defaults & Zero Playwright in server.js
 * 6. Socket.IO Auth Scoping & Order Room Isolation (subscribe-order)
 * 7. Public & Auth HTTP Endpoint Contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const axios = require('axios');

const { setupServerEnv, ROOT_DIR, CAMPAIGNS_DIR } = require('./helpers/test_env');
const { SocketClient } = require('./helpers/socket_client');

async function getClosedLocalPort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.listen(0, '127.0.0.1', () => {
            const port = srv.address().port;
            srv.close((err) => (err ? reject(err) : resolve(port)));
        });
    });
}

describe('Commercial Features Comprehensive Test Suite', () => {
    let env = null;
    let guestCookie = null;
    let closedPort = 0;
    let originalProxyConfig = null;

    let campaigns = null;
    let createCampaignState = null;
    let scheduleTick = null;
    let completeCampaign = null;
    let globalProxyPool = null;
    let loadCampaignsFromDisk = null;
    let orderService = null;

    const originalAxiosGet = axios.get;
    const originalAxiosPost = axios.post;

    before(async () => {
        env = await setupServerEnv();
        orderService = env.orderService;
        ({
            campaigns,
            createCampaignState,
            scheduleTick,
            completeCampaign,
            globalProxyPool,
            loadCampaignsFromDisk
        } = env.serverModule);

        closedPort = await getClosedLocalPort();
        guestCookie = await env.loginAsGuest();

        const proxyRes = await env.request('GET', '/api/proxy-config', { cookie: env.adminCookie });
        originalProxyConfig = proxyRes.body && proxyRes.body.data
            ? proxyRes.body.data
            : { region: 'random', keys: [], cooldownSec: 30 };

        // Prevent tests from making outbound calls to KiotProxy or Telegram
        axios.get = function (url, ...rest) {
            if (typeof url === 'string' && url.startsWith('https://api.kiotproxy.com')) {
                return Promise.resolve({ data: { success: false, message: 'mocked offline in unit test' } });
            }
            return originalAxiosGet.call(this, url, ...rest);
        };
        axios.post = function (url, ...rest) {
            if (typeof url === 'string' && url.startsWith('https://api.telegram.org')) {
                return Promise.resolve({ data: { ok: true, result: {} } });
            }
            return originalAxiosPost.call(this, url, ...rest);
        };
    });

    after(async () => {
        axios.get = originalAxiosGet;
        axios.post = originalAxiosPost;

        if (env && originalProxyConfig) {
            try {
                await env.request('POST', '/api/proxy-config', {
                    cookie: env.adminCookie,
                    body: originalProxyConfig
                });
            } catch {}
        }
        if (env) {
            await env.teardown();
        }
    });

    function fastTargetUrl(suffix = 'page') {
        return `http://127.0.0.1:${closedPort}/${suffix}`;
    }

    async function createTestOrder(overrides = {}) {
        const res = await env.request('POST', '/api/orders', {
            body: {
                targetUrl: fastTargetUrl('order'),
                proxyKey: 'kiot_commercial_key_1234',
                targetClicks: 100,
                durationHours: 1,
                name: 'Commercial Test Order',
                ...overrides
            }
        });
        assert.strictEqual(res.status, 201);
        if (overrides.proxyKey || res.body.proxyKey) {
            env.trackProxyKey(res.body.proxyKey || overrides.proxyKey);
        }
        return res;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Payment Webhook (/api/payment/webhook) & Secret Non-Leakage
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. Payment Webhook & Secret Non-Leakage', () => {
        const testSecret = 'whsec_commercial_test_987654';

        before(async () => {
            const res = await env.request('POST', '/api/admin/payment-config', {
                cookie: env.adminCookie,
                body: {
                    bankId: 'MB',
                    bankName: 'MBBank',
                    accountNumber: '0987654321',
                    accountName: 'TRAFFIC SERVICE',
                    template: 'compact2',
                    webhookSecret: testSecret
                }
            });
            assert.strictEqual(res.status, 200);
        });

        it('never leaks webhookSecret in POST /api/orders, disk order.bankInfo, or GET /api/orders/:id', async () => {
            const createRes = await createTestOrder({ name: 'Secret Non-Leak Check' });
            assert.strictEqual('webhookSecret' in (createRes.body.bankInfo || {}), false);

            const diskOrder = orderService.getOrder(createRes.body.orderId);
            assert.strictEqual('webhookSecret' in (diskOrder.bankInfo || {}), false);

            const getRes = await env.request('GET', `/api/orders/${createRes.body.orderId}`);
            assert.strictEqual(getRes.status, 200);
            assert.strictEqual('webhookSecret' in (getRes.body.order.bankInfo || {}), false);
        });

        it('returns 401 for missing, wrong, or empty webhook secret', async () => {
            const createRes = await createTestOrder({ name: 'Webhook 401 Check' });
            const payload = {
                transferType: 'in',
                transferAmount: createRes.body.totalAmount,
                content: createRes.body.orderCode
            };

            const missingAuth = await env.request('POST', '/api/payment/webhook', { body: payload });
            assert.strictEqual(missingAuth.status, 401);

            const wrongAuth = await env.request('POST', '/api/payment/webhook', {
                headers: { Authorization: 'Apikey wrong_secret_value' },
                body: payload
            });
            assert.strictEqual(wrongAuth.status, 401);

            const emptySupplied = await env.request('POST', '/api/payment/webhook', {
                headers: { Authorization: 'Apikey    ' },
                body: payload
            });
            assert.strictEqual(emptySupplied.status, 401);

            // Configured empty webhookSecret must reject all webhook calls with 401
            orderService.setPaymentConfig({ webhookSecret: '' });
            try {
                const emptyConfigured = await env.request('POST', '/api/payment/webhook', {
                    headers: { Authorization: 'Apikey ' },
                    body: payload
                });
                assert.strictEqual(emptyConfigured.status, 401);

                const anyWithEmptyCfg = await env.request('POST', '/api/payment/webhook', {
                    headers: { Authorization: `Apikey ${testSecret}` },
                    body: payload
                });
                assert.strictEqual(anyWithEmptyCfg.status, 401);
            } finally {
                orderService.setPaymentConfig({ webhookSecret: testSecret });
            }

            assert.strictEqual(orderService.getOrder(createRes.body.orderId).status, 'pending_payment');
        });

        it('ignores low amount, outgoing transfer, missing TF code, and unknown order code', async () => {
            const createRes = await createTestOrder({ name: 'Webhook Ignore Check' });
            const headers = { Authorization: `Apikey ${testSecret}` };

            const lowAmt = await env.request('POST', '/api/payment/webhook', {
                headers,
                body: {
                    transferType: 'in',
                    transferAmount: createRes.body.totalAmount - 1,
                    content: `Thanh toan ${createRes.body.orderCode}`
                }
            });
            assert.strictEqual(lowAmt.status, 200);
            assert.strictEqual(lowAmt.body.ignored, true);
            assert.strictEqual(lowAmt.body.reason, 'amount too low');

            const outTransfer = await env.request('POST', '/api/payment/webhook', {
                headers,
                body: {
                    transferType: 'out',
                    transferAmount: createRes.body.totalAmount,
                    content: createRes.body.orderCode
                }
            });
            assert.strictEqual(outTransfer.status, 200);
            assert.strictEqual(outTransfer.body.ignored, true);

            const noCode = await env.request('POST', '/api/payment/webhook', {
                headers,
                body: { transferType: 'in', transferAmount: 999999, content: 'No order code here' }
            });
            assert.strictEqual(noCode.status, 200);
            assert.strictEqual(noCode.body.ignored, true);
            assert.strictEqual(noCode.body.reason, 'no order code');

            const unknownCode = await env.request('POST', '/api/payment/webhook', {
                headers,
                body: { transferType: 'in', transferAmount: 999999, content: 'TF999999999' }
            });
            assert.strictEqual(unknownCode.status, 200);
            assert.strictEqual(unknownCode.body.ignored, true);
            assert.strictEqual(unknownCode.body.reason, 'order not found');

            const stillPending = orderService.getOrder(createRes.body.orderId);
            assert.strictEqual(stillPending.status, 'pending_payment');
            assert.strictEqual(stillPending.campaignId, null);
        });

        it('activates order via SePay and Casso payloads and guarantees idempotency', async () => {
            const headers = { Authorization: `Apikey ${testSecret}` };

            // SePay format: transferType='in', transferAmount, content
            const sepayOrder = await createTestOrder({
                proxyKey: 'cust_sepay_key_1111',
                name: 'SePay Webhook Order'
            });
            const sepayRes = await env.request('POST', '/api/payment/webhook', {
                headers,
                body: {
                    transferType: 'in',
                    transferAmount: sepayOrder.body.totalAmount,
                    content: `MBVCB ${sepayOrder.body.orderCode.toLowerCase()} thanh toan`
                }
            });
            assert.strictEqual(sepayRes.status, 200);
            assert.strictEqual(sepayRes.body.success, true);
            assert.strictEqual(sepayRes.body.already, false);
            assert.strictEqual(sepayRes.body.orderId, sepayOrder.body.orderId);
            assert.ok(sepayRes.body.campaignId);

            const diskSepay = orderService.getOrder(sepayOrder.body.orderId);
            assert.strictEqual(diskSepay.status, 'running');
            assert.strictEqual(diskSepay.paymentStatus, 'paid');
            assert.strictEqual(diskSepay.paymentMethod, 'bank_webhook');
            assert.strictEqual(diskSepay.paidAmount, sepayOrder.body.totalAmount);
            assert.strictEqual(campaigns.get(sepayRes.body.campaignId).paymentStatus, 'paid');

            // Idempotency replay
            const replayRes = await env.request('POST', '/api/payment/webhook', {
                headers,
                body: {
                    transferType: 'in',
                    transferAmount: sepayOrder.body.totalAmount,
                    content: sepayOrder.body.orderCode
                }
            });
            assert.strictEqual(replayRes.status, 200);
            assert.strictEqual(replayRes.body.success, true);
            assert.strictEqual(replayRes.body.already, true);
            assert.strictEqual(replayRes.body.campaignId, sepayRes.body.campaignId);

            // Casso format: amount, description (overpayment >= totalAmount)
            const cassoOrder = await createTestOrder({
                proxyKey: 'cust_casso_key_2222',
                name: 'Casso Webhook Order'
            });
            const overpaidAmount = cassoOrder.body.totalAmount + 5000;
            const cassoRes = await env.request('POST', '/api/payment/webhook', {
                headers,
                body: {
                    amount: overpaidAmount,
                    description: `NAP ${cassoOrder.body.orderCode}`
                }
            });
            assert.strictEqual(cassoRes.status, 200);
            assert.strictEqual(cassoRes.body.success, true);
            assert.strictEqual(cassoRes.body.already, false);
            assert.strictEqual(cassoRes.body.orderId, cassoOrder.body.orderId);
            assert.ok(cassoRes.body.campaignId);
            assert.strictEqual(orderService.getOrder(cassoOrder.body.orderId).paidAmount, overpaidAmount);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Public Masking & Admin Orders / Payment Config APIs
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. Public Order Masking & Admin Orders / Payment Config APIs', () => {
        it('strips plaintext proxyKey and exposes proxyKeyMasked and progress on GET /api/orders/:id', async () => {
            const longKeyRes = await createTestOrder({ proxyKey: 'kiot_live_secret_ABCD' });
            const pubPending = await env.request('GET', `/api/orders/${longKeyRes.body.orderId}`);
            assert.strictEqual(pubPending.status, 200);
            assert.strictEqual('proxyKey' in pubPending.body.order, false);
            assert.strictEqual(pubPending.body.order.proxyKeyMasked, '...ABCD');
            assert.strictEqual(pubPending.body.order.progress, null);

            const shortKeyRes = await createTestOrder({ proxyKey: 'abcd' });
            const pubShort = await env.request('GET', `/api/orders/${shortKeyRes.body.orderId}`);
            assert.strictEqual(pubShort.status, 200);
            assert.strictEqual('proxyKey' in pubShort.body.order, false);
            assert.strictEqual(pubShort.body.order.proxyKeyMasked, '****');

            const confirmRes = await env.request('POST', `/api/orders/${longKeyRes.body.orderId}/confirm`, {
                cookie: env.adminCookie
            });
            assert.strictEqual(confirmRes.status, 200);
            const camp = campaigns.get(confirmRes.body.campaignId);
            camp.successVisits = 9;
            camp.failedVisits = 2;

            const pubRunning = await env.request('GET', `/api/orders/${longKeyRes.body.orderId}`);
            assert.strictEqual(pubRunning.status, 200);
            assert.strictEqual('proxyKey' in pubRunning.body.order, false);
            assert.deepStrictEqual(
                {
                    orderId: pubRunning.body.order.progress.orderId,
                    campaignId: pubRunning.body.order.progress.campaignId,
                    status: pubRunning.body.order.progress.status,
                    successVisits: pubRunning.body.order.progress.successVisits,
                    failedVisits: pubRunning.body.order.progress.failedVisits,
                    targetLimit: pubRunning.body.order.progress.targetLimit
                },
                {
                    orderId: longKeyRes.body.orderId,
                    campaignId: confirmRes.body.campaignId,
                    status: 'running',
                    successVisits: 9,
                    failedVisits: 2,
                    targetLimit: 100
                }
            );
        });

        it('enforces 401/403 on admin orders & payment-config endpoints for non-admin callers', async () => {
            const dummyOrder = await createTestOrder({ name: 'Auth Guard Check' });

            const endpoints = [
                { method: 'GET', url: '/api/admin/orders' },
                { method: 'DELETE', url: `/api/admin/orders/${dummyOrder.body.orderId}` },
                { method: 'GET', url: '/api/admin/payment-config' },
                {
                    method: 'POST',
                    url: '/api/admin/payment-config',
                    body: { bankId: 'MB', accountNumber: '123', accountName: 'TEST' }
                }
            ];

            for (const ep of endpoints) {
                const unauth = await env.request(ep.method, ep.url, { body: ep.body || null });
                assert.strictEqual(unauth.status, 401, `Expected 401 unauthenticated for ${ep.method} ${ep.url}`);

                const guest = await env.request(ep.method, ep.url, { cookie: guestCookie, body: ep.body || null });
                assert.strictEqual(guest.status, 403, `Expected 403 guest for ${ep.method} ${ep.url}`);
            }
        });

        it('allows admin GET/DELETE orders (blocking DELETE while running/waiting) and GET/POST payment-config', async () => {
            const orderRes = await createTestOrder({
                proxyKey: 'admin_visible_proxy_7890',
                name: 'Admin CRUD Order'
            });
            const orderId = orderRes.body.orderId;

            const confirmRes = await env.request('POST', `/api/orders/${orderId}/confirm`, {
                cookie: env.adminCookie
            });
            assert.strictEqual(confirmRes.status, 200);
            const campId = confirmRes.body.campaignId;

            // Admin GET /api/admin/orders exposes plaintext proxyKey, summary, effectiveStatus, progress
            const listRes = await env.request('GET', '/api/admin/orders', { cookie: env.adminCookie });
            assert.strictEqual(listRes.status, 200);
            assert.strictEqual(listRes.body.success, true);
            assert.ok(listRes.body.summary.totalOrders >= 1);
            assert.strictEqual(typeof listRes.body.summary.totalRevenue, 'number');
            const found = listRes.body.orders.find((o) => o.orderId === orderId);
            assert.ok(found, 'Order must appear in admin list');
            assert.strictEqual(found.proxyKey, 'admin_visible_proxy_7890');
            assert.strictEqual(found.proxyKeyMasked, '...7890');
            assert.strictEqual(found.effectiveStatus, 'running');
            assert.ok(found.progress);

            // DELETE blocked while running
            const delRunning = await env.request('DELETE', `/api/admin/orders/${orderId}`, { cookie: env.adminCookie });
            assert.strictEqual(delRunning.status, 400);
            assert.ok(orderService.getOrder(orderId), 'Order must still exist when delete is blocked');

            // DELETE blocked while waiting
            const camp = campaigns.get(campId);
            const origStartTime = camp.startTime;
            camp.startTime = Date.now() + 60000;
            camp.status = 'waiting';
            const delWaiting = await env.request('DELETE', `/api/admin/orders/${orderId}`, { cookie: env.adminCookie });
            assert.strictEqual(delWaiting.status, 400);
            camp.startTime = origStartTime;
            camp.status = 'running';

            // Stop campaign, then DELETE succeeds
            const stopRes = await env.request('POST', `/api/campaigns/${campId}/stop`, { cookie: env.adminCookie });
            assert.strictEqual(stopRes.status, 200);

            const delStopped = await env.request('DELETE', `/api/admin/orders/${orderId}`, { cookie: env.adminCookie });
            assert.strictEqual(delStopped.status, 200);
            assert.strictEqual(delStopped.body.success, true);
            assert.strictEqual(orderService.getOrder(orderId), null);

            // DELETE non-existent -> 404
            const delMissing = await env.request('DELETE', '/api/admin/orders/ORD-MISSING-000', { cookie: env.adminCookie });
            assert.strictEqual(delMissing.status, 404);

            // Admin payment-config validation + save/read
            const badCfg = await env.request('POST', '/api/admin/payment-config', {
                cookie: env.adminCookie,
                body: { bankId: 'MB' }
            });
            assert.strictEqual(badCfg.status, 400);

            const saveCfg = await env.request('POST', '/api/admin/payment-config', {
                cookie: env.adminCookie,
                body: {
                    bankId: 'vcb',
                    bankName: 'Vietcombank',
                    accountNumber: '1122334455',
                    accountName: 'cong ty test',
                    template: 'compact',
                    webhookSecret: 'sec_vcb_123'
                }
            });
            assert.strictEqual(saveCfg.status, 200);
            assert.strictEqual(saveCfg.body.config.bankId, 'VCB');
            assert.strictEqual(saveCfg.body.config.accountName, 'CONG TY TEST');
            assert.strictEqual(saveCfg.body.config.webhookSecret, 'sec_vcb_123');

            const getCfg = await env.request('GET', '/api/admin/payment-config', { cookie: env.adminCookie });
            assert.strictEqual(getCfg.status, 200);
            assert.strictEqual(getCfg.body.config.bankId, 'VCB');
            assert.strictEqual(getCfg.body.config.webhookSecret, 'sec_vcb_123');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. completeCampaign() Sync & Terminal Order State Protection
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. completeCampaign() Sync & Terminal Order State Protection', () => {
        it('syncs completed, completedAt, successVisits, failedVisits to orderService on disk', async () => {
            const orderRes = await createTestOrder({ name: 'Completion Sync Order' });
            const orderId = orderRes.body.orderId;

            const confirmRes = await env.request('POST', `/api/orders/${orderId}/confirm`, {
                cookie: env.adminCookie
            });
            assert.strictEqual(confirmRes.status, 200);
            const campId = confirmRes.body.campaignId;

            const camp = campaigns.get(campId);
            camp.successVisits = 42;
            camp.failedVisits = 3;

            completeCampaign(campId, 'completed');

            assert.strictEqual(camp.status, 'completed');
            assert.ok(camp.actualEndTime > 0);

            const diskOrder = orderService.getOrder(orderId);
            assert.strictEqual(diskOrder.status, 'completed');
            assert.strictEqual(diskOrder.completedAt, camp.actualEndTime);
            assert.strictEqual(diskOrder.successVisits, 42);
            assert.strictEqual(diskOrder.failedVisits, 3);
        });

        it('prevents updateOrderStatus from reverting terminal states back to pending_payment', () => {
            for (const terminalState of ['completed', 'expired', 'stopped']) {
                const order = orderService.createOrder({
                    targetUrl: fastTargetUrl('terminal'),
                    proxyKey: `terminal_key_${terminalState}`,
                    targetClicks: 50,
                    durationHours: 1,
                    name: `Terminal ${terminalState}`
                });
                env.trackOrder(order.orderId);

                orderService.confirmOrderPayment(order.orderId);
                orderService.updateOrderStatus(order.orderId, terminalState, { completedAt: Date.now() });

                const reverted = orderService.updateOrderStatus(order.orderId, 'pending_payment');
                assert.strictEqual(reverted.status, terminalState);

                const onDisk = orderService.getOrder(order.orderId);
                assert.strictEqual(onDisk.status, terminalState);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. customerProxyKey Isolation Across initProxyPool & loadCampaignsFromDisk
    // ─────────────────────────────────────────────────────────────────────────
    describe('4. customerProxyKey Isolation Across initProxyPool & loadCampaignsFromDisk()', () => {
        it('preserves customer keys from activateOrder and loadCampaignsFromDisk across initProxyPool updates', async () => {
            const activeOrder = await createTestOrder({
                proxyKey: 'cust_pool_active_A1',
                name: 'Pool Isolation Active'
            });
            const confirmRes = await env.request('POST', `/api/orders/${activeOrder.body.orderId}/confirm`, {
                cookie: env.adminCookie
            });
            assert.strictEqual(confirmRes.status, 200);
            assert.ok(globalProxyPool.has('cust_pool_active_A1'));

            // Write a campaign JSON on disk with a customerProxyKey and reload via loadCampaignsFromDisk()
            const diskCampId = `test_disk_isolation_${Date.now()}`;
            const diskCustomerKey = 'cust_pool_disk_B2';
            const now = Date.now();
            env.trackCampaign(diskCampId);
            env.trackProxyKey(diskCustomerKey);
            fs.writeFileSync(
                path.join(CAMPAIGNS_DIR, `${diskCampId}.json`),
                JSON.stringify({
                    name: 'Disk Isolation Campaign',
                    targetUrl: fastTargetUrl('disk-iso'),
                    targetClicks: 20,
                    startTime: now - 1000,
                    endTime: now + 3600000,
                    browserMode: 'request',
                    paymentStatus: 'paid',
                    customerProxyKey: diskCustomerKey
                }, null, 4)
            );

            loadCampaignsFromDisk();
            assert.ok(campaigns.has(diskCampId));
            assert.ok(globalProxyPool.has(diskCustomerKey));

            // Update global proxy pool via admin API (calls initProxyPool internally)
            const poolUpdate1 = await env.request('POST', '/api/proxy-config', {
                cookie: env.adminCookie,
                body: { region: 'random', keys: ['global_shared_key_1'], cooldownSec: 30 }
            });
            assert.strictEqual(poolUpdate1.status, 200);
            assert.ok(globalProxyPool.has('global_shared_key_1'));
            assert.ok(globalProxyPool.has('cust_pool_active_A1'), 'Active customer key must survive initProxyPool');
            assert.ok(globalProxyPool.has(diskCustomerKey), 'Disk-loaded customer key must survive initProxyPool');

            // Replace global key with another global key: old global key deleted, customer keys kept
            const poolUpdate2 = await env.request('POST', '/api/proxy-config', {
                cookie: env.adminCookie,
                body: { region: 'random', keys: ['global_shared_key_2'], cooldownSec: 30 }
            });
            assert.strictEqual(poolUpdate2.status, 200);
            assert.strictEqual(globalProxyPool.has('global_shared_key_1'), false);
            assert.ok(globalProxyPool.has('global_shared_key_2'));
            assert.ok(globalProxyPool.has('cust_pool_active_A1'));
            assert.ok(globalProxyPool.has(diskCustomerKey));

            const diskCampState = campaigns.get(diskCampId);
            if (diskCampState) diskCampState.status = 'stopped';
            campaigns.delete(diskCampId);
        });

        it('prevents global campaigns from acquiring customer keys and vice versa in scheduleTick', async () => {
            const now = Date.now();
            const custCampId = `test_acquire_cust_${Date.now()}`;
            const globalCampId = `test_acquire_global_${Date.now()}`;
            const dedicatedKey = 'cust_dedicated_only_key_Z9';

            env.trackCampaign(custCampId);
            env.trackCampaign(globalCampId);
            env.trackProxyKey(dedicatedKey);

            // Seed customer key as FREE via disk load
            fs.writeFileSync(
                path.join(CAMPAIGNS_DIR, `${custCampId}.json`),
                JSON.stringify({
                    name: 'Dedicated Customer Camp',
                    targetUrl: fastTargetUrl('cust'),
                    targetClicks: 10,
                    startTime: now - 1000,
                    endTime: now + 3600000,
                    paymentStatus: 'paid',
                    customerProxyKey: dedicatedKey
                }, null, 4)
            );
            loadCampaignsFromDisk();

            // Clear global pool keys so only dedicatedKey is free in globalProxyPool
            await env.request('POST', '/api/proxy-config', {
                cookie: env.adminCookie,
                body: { region: 'random', keys: [], cooldownSec: 30 }
            });
            const custKeyState = globalProxyPool.get(dedicatedKey);
            assert.ok(custKeyState);
            custKeyState.isBusy = false;
            custKeyState.nextRequestAt = 0;

            const globalCamp = createCampaignState(globalCampId, {
                name: 'Global No-Customer-Key Camp',
                targetUrl: fastTargetUrl('global'),
                targetClicks: 10,
                startTime: now - 1000,
                endTime: now + 3600000,
                paymentStatus: 'paid'
            });
            campaigns.set(globalCampId, globalCamp);

            await scheduleTick(globalCampId);
            assert.strictEqual(globalCamp.totalVisits, 0, 'Global campaign must never acquire customer key');
            assert.strictEqual(custKeyState.isBusy, false);

            // Now add a FREE global key, mark dedicatedKey busy -> customer campaign must not steal global key
            await env.request('POST', '/api/proxy-config', {
                cookie: env.adminCookie,
                body: { region: 'random', keys: ['global_free_key_G1'], cooldownSec: 30 }
            });
            const globalKeyState = globalProxyPool.get('global_free_key_G1');
            globalKeyState.isBusy = false;
            globalKeyState.nextRequestAt = 0;
            custKeyState.isBusy = true;

            const custCamp = campaigns.get(custCampId);
            await scheduleTick(custCampId);
            assert.strictEqual(custCamp.totalVisits, 0, 'Customer campaign must not steal global pool key');
            assert.strictEqual(globalKeyState.isBusy, false);

            custKeyState.isBusy = false;
            globalCamp.status = 'stopped';
            custCamp.status = 'stopped';
            campaigns.delete(globalCampId);
            campaigns.delete(custCampId);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Strict Request Mode, Dwell Defaults & Zero Playwright in server.js
    // ─────────────────────────────────────────────────────────────────────────
    describe('5. Strict Request Mode, Dwell Defaults & Zero Playwright in server.js', () => {
        it('forces browserMode === "request" on POST /api/campaigns regardless of client input', async () => {
            const now = Date.now();
            const res = await env.request('POST', '/api/campaigns', {
                cookie: env.adminCookie,
                body: {
                    name: 'Attempt Playwright Mode',
                    targetUrl: fastTargetUrl('mode-test'),
                    targetClicks: 25,
                    startTime: now + 60000,
                    endTime: now + 3660000,
                    browserMode: 'playwright'
                }
            });
            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.success, true);

            const camp = campaigns.get(res.body.id);
            assert.strictEqual(camp.config.browserMode, 'request');

            const diskCfg = JSON.parse(fs.readFileSync(path.join(CAMPAIGNS_DIR, `${res.body.id}.json`), 'utf-8'));
            assert.strictEqual(diskCfg.browserMode, 'request');
        });

        it('forces browserMode === "request" on POST /api/orders and sets dwellMin/dwellMax defaults on activation', async () => {
            const orderRes = await createTestOrder({
                browserMode: 'chromium',
                name: 'Order BrowserMode Enforcement'
            });
            assert.strictEqual(orderRes.body.browserMode, 'request');
            assert.strictEqual(orderService.getOrder(orderRes.body.orderId).browserMode, 'request');

            const confirmRes = await env.request('POST', `/api/orders/${orderRes.body.orderId}/confirm`, {
                cookie: env.adminCookie
            });
            assert.strictEqual(confirmRes.status, 200);
            const camp = campaigns.get(confirmRes.body.campaignId);
            assert.strictEqual(camp.config.browserMode, 'request');
            assert.strictEqual(camp.config.dwellMin, 2);
            assert.strictEqual(camp.config.dwellMax, 5);
        });

        it('contains zero playwright, browser-launch, or child_process spawn references in server.js', () => {
            const serverSource = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf-8');
            const sourceWithoutSecChUa = serverSource
                .split(/\r?\n/)
                .filter((line) => !line.includes("'sec-ch-ua'"))
                .join('\n');
            assert.strictEqual(/playwright/i.test(serverSource), false, 'server.js must not reference playwright');
            assert.strictEqual(/chromium/i.test(sourceWithoutSecChUa), false, 'server.js must not reference chromium outside sec-ch-ua header');
            assert.strictEqual(/puppeteer|chromium\.launch|launchPersistentContext|newContext\(|newPage\(/i.test(serverSource), false, 'server.js must not invoke browser automation');
            assert.strictEqual(/child_process|\.spawn\(/i.test(serverSource), false, 'server.js must not spawn child processes');
            assert.match(serverSource, /Number\(campaign\.config\.dwellMin\)\s*\|\|\s*2/);
            assert.match(serverSource, /Number\(campaign\.config\.dwellMax\)\s*\|\|\s*5/);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Socket.IO Auth Scoping & Order Room Isolation
    // ─────────────────────────────────────────────────────────────────────────
    describe('6. Socket.IO Auth Scoping & Order Room Isolation', () => {
        it('does not send proxy-config or campaigns-list to anonymous Socket.IO clients, unlike admin clients', async () => {
            const anonClient = new SocketClient(env.baseUrl);
            const adminClient = new SocketClient(env.baseUrl, { cookie: env.adminCookie });

            try {
                await anonClient.connect();
                await adminClient.connect();

                const anonInfo = await anonClient.waitForEvent('user-info');
                assert.strictEqual(anonInfo.username || null, null);
                assert.strictEqual(anonInfo.role || null, null);

                const adminInfo = await adminClient.waitForEvent('user-info');
                assert.strictEqual(adminInfo.role, 'admin');
                await adminClient.waitForEvent('proxy-config');
                await adminClient.waitForEvent('campaigns-list');

                await new Promise((resolve) => setTimeout(resolve, 200));
                assert.strictEqual(anonClient.getEvents('proxy-config').length, 0, 'Anon must never receive proxy-config');
                assert.strictEqual(anonClient.getEvents('campaigns-list').length, 0, 'Anon must never receive campaigns-list');
            } finally {
                await anonClient.disconnect();
                await adminClient.disconnect();
            }
        });

        it('delivers payment-confirmed and order-progress ONLY to sockets subscribed to that orderId', async () => {
            const orderA = await createTestOrder({ proxyKey: 'sock_key_A_1111', name: 'Socket Order A' });
            const orderB = await createTestOrder({ proxyKey: 'sock_key_B_2222', name: 'Socket Order B' });

            const clientA = new SocketClient(env.baseUrl);
            const clientB = new SocketClient(env.baseUrl);
            const lateClientA = new SocketClient(env.baseUrl);

            try {
                await clientA.connect();
                await clientB.connect();

                await clientA.emit('subscribe-order', orderA.body.orderId);
                await clientB.emit('subscribe-order', orderB.body.orderId);
                await clientB.emit('subscribe-order', 'ORD-DOES-NOT-EXIST');
                await new Promise((resolve) => setTimeout(resolve, 50));

                // Activate order A -> only clientA gets payment-confirmed & order-progress
                const confirmA = await env.request('POST', `/api/orders/${orderA.body.orderId}/confirm`, {
                    cookie: env.adminCookie
                });
                assert.strictEqual(confirmA.status, 200);

                const paidEventA = await clientA.waitForEvent('payment-confirmed', (d) => d.orderId === orderA.body.orderId);
                assert.strictEqual(paidEventA.campaignId, confirmA.body.campaignId);

                const progEventA = await clientA.waitForEvent('order-progress', (d) => d.orderId === orderA.body.orderId);
                assert.strictEqual(progEventA.campaignId, confirmA.body.campaignId);

                // Complete campaign A -> only clientA receives completed order-progress
                const campA = campaigns.get(confirmA.body.campaignId);
                campA.successVisits = 12;
                completeCampaign(confirmA.body.campaignId, 'completed');

                const doneEventA = await clientA.waitForEvent(
                    'order-progress',
                    (d) => d.orderId === orderA.body.orderId && d.status === 'completed'
                );
                assert.strictEqual(doneEventA.successVisits, 12);

                await new Promise((resolve) => setTimeout(resolve, 150));
                assert.strictEqual(
                    clientB.getEvents('payment-confirmed').filter((d) => d.orderId === orderA.body.orderId).length,
                    0,
                    'Client subscribed to B must not receive payment-confirmed for A'
                );
                assert.strictEqual(
                    clientB.getEvents('order-progress').filter((d) => d.orderId === orderA.body.orderId).length,
                    0,
                    'Client subscribed to B must not receive order-progress for A'
                );

                // Activate order B -> only clientB gets events for orderB
                const confirmB = await env.request('POST', `/api/orders/${orderB.body.orderId}/confirm`, {
                    cookie: env.adminCookie
                });
                assert.strictEqual(confirmB.status, 200);
                await clientB.waitForEvent('payment-confirmed', (d) => d.orderId === orderB.body.orderId);
                await clientB.waitForEvent('order-progress', (d) => d.orderId === orderB.body.orderId);

                await new Promise((resolve) => setTimeout(resolve, 150));
                assert.strictEqual(
                    clientA.getEvents('payment-confirmed').filter((d) => d.orderId === orderB.body.orderId).length,
                    0,
                    'Client subscribed to A must not receive payment-confirmed for B'
                );
                assert.strictEqual(
                    clientA.getEvents('order-progress').filter((d) => d.orderId === orderB.body.orderId).length,
                    0,
                    'Client subscribed to A must not receive order-progress for B'
                );

                // Late subscriber receives current order-progress immediately upon subscribe-order
                await lateClientA.connect();
                await lateClientA.emit('subscribe-order', orderA.body.orderId);
                const lateProg = await lateClientA.waitForEvent('order-progress', (d) => d.orderId === orderA.body.orderId);
                assert.strictEqual(lateProg.status, 'completed');
                assert.strictEqual(lateProg.successVisits, 12);
            } finally {
                await clientA.disconnect();
                await clientB.disconnect();
                await lateClientA.disconnect();
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Public & Auth HTTP Endpoint Checks
    // ─────────────────────────────────────────────────────────────────────────
    describe('7. Public & Auth HTTP Endpoint Checks', () => {
        it('returns HTTP 200 for /order.html, /track.html, /login.html, and POST /api/orders/calculate-cost without auth', async () => {
            for (const pagePath of ['/order.html', '/track.html', '/login.html']) {
                const res = await env.request('GET', pagePath);
                assert.strictEqual(res.status, 200, `Expected HTTP 200 for ${pagePath}`);
                assert.match(String(res.headers['content-type'] || ''), /text\/html/i);
            }

            const calcRes = await env.request('POST', '/api/orders/calculate-cost', {
                body: { targetClicks: 1000, durationHours: 1.5 }
            });
            assert.strictEqual(calcRes.status, 200);
            assert.strictEqual(calcRes.body.success, true);
            assert.strictEqual(calcRes.body.totalAmount, 44000);
        });

        it('enforces auth on GET /api/admin/orders (401 unauthenticated, 403 guest, 200 admin) and root / redirect', async () => {
            const unauthAdminOrders = await env.request('GET', '/api/admin/orders');
            assert.strictEqual(unauthAdminOrders.status, 401);

            const guestAdminOrders = await env.request('GET', '/api/admin/orders', { cookie: guestCookie });
            assert.strictEqual(guestAdminOrders.status, 403);

            const adminOrders = await env.request('GET', '/api/admin/orders', { cookie: env.adminCookie });
            assert.strictEqual(adminOrders.status, 200);
            assert.strictEqual(adminOrders.body.success, true);

            const unauthRoot = await env.request('GET', '/');
            assert.strictEqual(unauthRoot.status, 302);
            assert.strictEqual(unauthRoot.headers.location, '/login.html');

            const authRoot = await env.request('GET', '/', { cookie: env.adminCookie });
            assert.strictEqual(authRoot.status, 200);
        });
    });
});

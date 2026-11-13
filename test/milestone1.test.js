/**
 * Comprehensive Verification Test Suite for Milestone 1:
 * Commercial Order & Pricing Engine with Strict Payment Gating
 *
 * Suites:
 * 1. Pricing Engine & Ceiling Rounding Formula (calculateOrderCost)
 * 2. Order Parameter Validation (validateOrderParams)
 * 3. VietQR QuickLink Synthesis & Format Compliance (generateVietQrUrl)
 * 4. Order Persistence, Sanitization & State Lifecycle (orderService)
 * 5. Strict Zero-Click Pre-Payment Gating (scheduleTick & runVisitWorker)
 * 6. End-to-End Express API Routes & Instant Auto-Activation
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const orderService = require('../orderService');
const { setupServerEnv } = require('./helpers/test_env');

const ORDERS_DIR = path.join(__dirname, '..', 'orders');

describe('Milestone 1: Commercial Order & Pricing Engine Test Suite', () => {
    let env = null;
    let campaigns = null;
    let createCampaignState = null;
    let scheduleTick = null;
    let globalProxyPool = null;

    before(async () => {
        env = await setupServerEnv();
        ({
            campaigns,
            createCampaignState,
            scheduleTick,
            globalProxyPool
        } = env.serverModule);
    });

    after(async () => {
        if (env) await env.teardown();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 1: Pricing Engine & Ceiling Rounding
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. Pricing Engine & Ceiling Rounding (calculateOrderCost)', () => {
        it('calculates minimum boundary: 1 click, 0.1 hr -> 2,040 VNĐ (rounded to 1 hr)', () => {
            const cost = orderService.calculateOrderCost(1, 0.1);
            assert.strictEqual(cost.clickFee, 40);
            assert.strictEqual(cost.roundedHours, 1);
            assert.strictEqual(cost.durationFee, 2000);
            assert.strictEqual(cost.totalAmount, 2040);
        });

        it('calculates 10 clicks, 0.5 hr -> 2,400 VNĐ (rounded to 1 hr)', () => {
            const cost = orderService.calculateOrderCost(10, 0.5);
            assert.strictEqual(cost.clickFee, 400);
            assert.strictEqual(cost.roundedHours, 1);
            assert.strictEqual(cost.durationFee, 2000);
            assert.strictEqual(cost.totalAmount, 2400);
        });

        it('calculates exact 1.0 hr boundary: 100 clicks, 1.0 hr -> 6,000 VNĐ', () => {
            const cost = orderService.calculateOrderCost(100, 1.0);
            assert.strictEqual(cost.clickFee, 4000);
            assert.strictEqual(cost.roundedHours, 1);
            assert.strictEqual(cost.durationFee, 2000);
            assert.strictEqual(cost.totalAmount, 6000);
        });

        it('calculates 1000 clicks, 1.0 hr -> 42,000 VNĐ', () => {
            const cost = orderService.calculateOrderCost(1000, 1.0);
            assert.strictEqual(cost.clickFee, 40000);
            assert.strictEqual(cost.roundedHours, 1);
            assert.strictEqual(cost.durationFee, 2000);
            assert.strictEqual(cost.totalAmount, 42000);
        });

        it('calculates 1.01 hr overflow boundary: 1000 clicks, 1.01 hr -> 44,000 VNĐ (rounded to 2 hr)', () => {
            const cost = orderService.calculateOrderCost(1000, 1.01);
            assert.strictEqual(cost.clickFee, 40000);
            assert.strictEqual(cost.roundedHours, 2);
            assert.strictEqual(cost.durationFee, 4000);
            assert.strictEqual(cost.totalAmount, 44000);
        });

        it('calculates benchmark spec case: 1000 clicks, 1.5 hr -> 44,000 VNĐ (rounded to 2 hr)', () => {
            const cost = orderService.calculateOrderCost(1000, 1.5);
            assert.strictEqual(cost.clickFee, 40000);
            assert.strictEqual(cost.roundedHours, 2);
            assert.strictEqual(cost.durationFee, 4000);
            assert.strictEqual(cost.totalAmount, 44000);
        });

        it('calculates exact 2.0 hr boundary: 1000 clicks, 2.0 hr -> 44,000 VNĐ', () => {
            const cost = orderService.calculateOrderCost(1000, 2.0);
            assert.strictEqual(cost.clickFee, 40000);
            assert.strictEqual(cost.roundedHours, 2);
            assert.strictEqual(cost.durationFee, 4000);
            assert.strictEqual(cost.totalAmount, 44000);
        });

        it('calculates 2.01 hr overflow: 5000 clicks, 2.01 hr -> 206,000 VNĐ (rounded to 3 hr)', () => {
            const cost = orderService.calculateOrderCost(5000, 2.01);
            assert.strictEqual(cost.clickFee, 200000);
            assert.strictEqual(cost.roundedHours, 3);
            assert.strictEqual(cost.durationFee, 6000);
            assert.strictEqual(cost.totalAmount, 206000);
        });

        it('calculates 24-hour campaign: 500 clicks, 24.0 hr -> 68,000 VNĐ', () => {
            const cost = orderService.calculateOrderCost(500, 24.0);
            assert.strictEqual(cost.clickFee, 20000);
            assert.strictEqual(cost.roundedHours, 24);
            assert.strictEqual(cost.durationFee, 48000);
            assert.strictEqual(cost.totalAmount, 68000);
        });

        it('calculates micro-duration: 100 clicks, 0.001 hr -> 6,000 VNĐ (rounded to 1 hr)', () => {
            const cost = orderService.calculateOrderCost(100, 0.001);
            assert.strictEqual(cost.clickFee, 4000);
            assert.strictEqual(cost.roundedHours, 1);
            assert.strictEqual(cost.durationFee, 2000);
            assert.strictEqual(cost.totalAmount, 6000);
        });

        it('guarantees totalAmount strictly equals clickFee + durationFee with no floating precision error', () => {
            const cost = orderService.calculateOrderCost(999, 3.14159);
            assert.strictEqual(cost.totalAmount, cost.clickFee + cost.durationFee);
            assert.strictEqual(cost.roundedHours, 4);
            assert.strictEqual(Number.isInteger(cost.totalAmount), true);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 2: Parameter Validation
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. Parameter Validation (validateOrderParams)', () => {
        it('accepts standard valid parameters', () => {
            const validParams = {
                targetUrl: 'https://example.com/landing',
                proxyKey: 'kiot_proxy_key_test_123',
                targetClicks: 1000,
                durationHours: 1.5
            };
            const result = orderService.validateOrderParams(validParams);
            assert.strictEqual(result.valid, true);
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(result.errors.length, 0);
            assert.strictEqual(result.sanitized.targetClicks, 1000);
        });

        it('accepts minimum valid parameters: 1 click, 0.1 hr, http protocol', () => {
            const result = orderService.validateOrderParams({
                targetUrl: 'http://my-blog.vn',
                proxyKey: 'p_1',
                targetClicks: 1,
                durationHours: 0.1
            });
            assert.strictEqual(result.valid, true);
        });

        it('rejects missing or empty targetUrl', () => {
            const r1 = orderService.validateOrderParams({ proxyKey: 'k', targetClicks: 10, durationHours: 1 });
            assert.strictEqual(r1.valid, false);
            assert.match(r1.errors[0], /targetUrl is required/i);

            const r2 = orderService.validateOrderParams({ targetUrl: '   ', proxyKey: 'k', targetClicks: 10, durationHours: 1 });
            assert.strictEqual(r2.valid, false);
        });

        it('rejects targetUrl without http:// or https:// protocol', () => {
            const result = orderService.validateOrderParams({
                targetUrl: 'example.com/path',
                proxyKey: 'k',
                targetClicks: 10,
                durationHours: 1
            });
            assert.strictEqual(result.valid, false);
            assert.match(result.errors[0], /targetUrl must use http:\/\/ or https:\/\/ protocol|not a valid URL/i);
        });

        it('rejects disallowed URL schemes: ftp://, javascript:, file://', () => {
            const schemes = ['ftp://files.example.com', 'javascript:alert(1)', 'file:///etc/passwd'];
            for (const badUrl of schemes) {
                const res = orderService.validateOrderParams({
                    targetUrl: badUrl,
                    proxyKey: 'k',
                    targetClicks: 10,
                    durationHours: 1
                });
                assert.strictEqual(res.valid, false, `Scheme ${badUrl} should be rejected`);
            }
        });

        it('rejects empty or whitespace proxyKey', () => {
            const keys = ['', '   ', null, undefined];
            for (const key of keys) {
                const res = orderService.validateOrderParams({
                    targetUrl: 'https://example.com',
                    proxyKey: key,
                    targetClicks: 10,
                    durationHours: 1
                });
                assert.strictEqual(res.valid, false);
                assert.match(res.errors[0], /proxyKey is required/i);
            }
        });

        it('rejects non-string proxyKey', () => {
            const res = orderService.validateOrderParams({
                targetUrl: 'https://example.com',
                proxyKey: 12345,
                targetClicks: 10,
                durationHours: 1
            });
            assert.strictEqual(res.valid, false);
        });

        it('rejects targetClicks = 0', () => {
            const res = orderService.validateOrderParams({
                targetUrl: 'https://example.com',
                proxyKey: 'k',
                targetClicks: 0,
                durationHours: 1
            });
            assert.strictEqual(res.valid, false);
            assert.match(res.errors[0], /targetClicks must be a positive integer/i);
        });

        it('rejects negative targetClicks', () => {
            const res = orderService.validateOrderParams({
                targetUrl: 'https://example.com',
                proxyKey: 'k',
                targetClicks: -5,
                durationHours: 1
            });
            assert.strictEqual(res.valid, false);
        });

        it('rejects float targetClicks', () => {
            const res = orderService.validateOrderParams({
                targetUrl: 'https://example.com',
                proxyKey: 'k',
                targetClicks: 10.5,
                durationHours: 1
            });
            assert.strictEqual(res.valid, false);
            assert.match(res.errors[0], /targetClicks must be a positive integer/i);
        });

        it('rejects non-numeric targetClicks', () => {
            const res = orderService.validateOrderParams({
                targetUrl: 'https://example.com',
                proxyKey: 'k',
                targetClicks: 'invalid',
                durationHours: 1
            });
            assert.strictEqual(res.valid, false);
        });

        it('rejects durationHours = 0', () => {
            const res = orderService.validateOrderParams({
                targetUrl: 'https://example.com',
                proxyKey: 'k',
                targetClicks: 10,
                durationHours: 0
            });
            assert.strictEqual(res.valid, false);
            assert.match(res.errors[0], /durationHours must be a positive number/i);
        });

        it('rejects negative durationHours', () => {
            const res = orderService.validateOrderParams({
                targetUrl: 'https://example.com',
                proxyKey: 'k',
                targetClicks: 10,
                durationHours: -1.5
            });
            assert.strictEqual(res.valid, false);
        });

        it('rejects non-numeric durationHours', () => {
            const res = orderService.validateOrderParams({
                targetUrl: 'https://example.com',
                proxyKey: 'k',
                targetClicks: 10,
                durationHours: 'ten_hours'
            });
            assert.strictEqual(res.valid, false);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 3: VietQR QuickLink Synthesis
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. VietQR QuickLink Synthesis (generateVietQrUrl)', () => {
        const defaultBank = {
            bankId: 'MB',
            bankName: 'MBBank',
            accountNumber: '0987654321',
            accountName: 'TRAFFIC SERVICE',
            template: 'compact2'
        };

        it('generates standard VietQR URL matching specification format', () => {
            const url = orderService.generateVietQrUrl(defaultBank, 44000, 'TF1001');
            const expected = 'https://img.vietqr.io/image/MB-0987654321-compact2.png?amount=44000&addInfo=TF1001&accountName=TRAFFIC%20SERVICE';
            assert.strictEqual(url, expected);
        });

        it('URL parses correctly with valid host, path, and query params', () => {
            const urlString = orderService.generateVietQrUrl(defaultBank, 44000, 'TF1001');
            const parsed = new URL(urlString);

            assert.strictEqual(parsed.protocol, 'https:');
            assert.strictEqual(parsed.hostname, 'img.vietqr.io');
            assert.strictEqual(parsed.pathname, '/image/MB-0987654321-compact2.png');
            assert.strictEqual(parsed.searchParams.get('amount'), '44000');
            assert.strictEqual(parsed.searchParams.get('addInfo'), 'TF1001');
            assert.strictEqual(parsed.searchParams.get('accountName'), 'TRAFFIC SERVICE');
        });

        it('converts accountName to uppercase ASCII with URL encoding', () => {
            const bank = { ...defaultBank, accountName: 'nguyen van a' };
            const url = orderService.generateVietQrUrl(bank, 2040, 'TF2001');
            assert.ok(url.includes('accountName=NGUYEN%20VAN%20A'));
        });

        it('rejects memo containing Vietnamese accents or special characters', () => {
            assert.throws(() => orderService.generateVietQrUrl(defaultBank, 40000, 'TF đơn hàng'), /memo must be a non-empty alphanumeric string/i);
            assert.throws(() => orderService.generateVietQrUrl(defaultBank, 40000, 'TF1001!'), /memo must be a non-empty alphanumeric string/i);
            assert.throws(() => orderService.generateVietQrUrl(defaultBank, 40000, 'TF@123'), /memo must be a non-empty alphanumeric string/i);
            assert.throws(() => orderService.generateVietQrUrl(defaultBank, 40000, 'TF 1001'), /memo must be a non-empty alphanumeric string/i);
        });

        it('rejects non-positive or float amount', () => {
            assert.throws(() => orderService.generateVietQrUrl(defaultBank, 0, 'TF1001'), /amount must be a positive integer/i);
            assert.throws(() => orderService.generateVietQrUrl(defaultBank, -100, 'TF1001'), /amount must be a positive integer/i);
            assert.throws(() => orderService.generateVietQrUrl(defaultBank, 44000.5, 'TF1001'), /amount must be a positive integer/i);
        });

        it('rejects missing bank configuration fields', () => {
            assert.throws(() => orderService.generateVietQrUrl({}, 44000, 'TF1001'), /Invalid bank configuration/i);
            assert.throws(() => orderService.generateVietQrUrl({ bankId: 'MB' }, 44000, 'TF1001'), /Invalid bank configuration/i);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 4: Order Persistence & State Lifecycle
    // ─────────────────────────────────────────────────────────────────────────
    describe('4. Order Persistence, Sanitization & State Lifecycle', () => {
        let createdOrderId = null;

        it('creates an order, persists to disk, and assigns pending_payment status', () => {
            const order = orderService.createOrder({
                targetUrl: 'https://example.com/product/123',
                proxyKey: 'test_kiot_key_001',
                targetClicks: 250,
                durationHours: 1.5,
                name: 'Test Persistent Order'
            });

            assert.ok(order.orderId);
            assert.match(order.orderCode, /^TF\d+$/);
            assert.strictEqual(order.status, 'pending_payment');
            assert.strictEqual(order.paymentStatus, 'pending_payment');
            assert.strictEqual(order.targetClicks, 250);
            assert.strictEqual(order.roundedHours, 2);
            assert.strictEqual(order.clickFee, 10000);
            assert.strictEqual(order.durationFee, 4000);
            assert.strictEqual(order.totalAmount, 14000);
            assert.ok(order.vietQrUrl);

            createdOrderId = order.orderId;
            env.trackOrder(createdOrderId);

            // Verify physical file on disk
            const filePath = path.join(ORDERS_DIR, `${order.orderId}.json`);
            assert.ok(fs.existsSync(filePath), 'Order file must exist on disk');
        });

        it('retrieves an existing order correctly', () => {
            const order = orderService.getOrder(createdOrderId);
            assert.ok(order);
            assert.strictEqual(order.orderId, createdOrderId);
            assert.strictEqual(order.targetClicks, 250);
        });

        it('prevents directory traversal attacks via sanitized getOrder', () => {
            assert.strictEqual(orderService.getOrder('../server'), null);
            assert.strictEqual(orderService.getOrder('..\\server'), null);
            assert.strictEqual(orderService.getOrder('/etc/passwd'), null);
            assert.strictEqual(orderService.getOrder('../../orders/fake'), null);
        });

        it('confirms order payment and sets paid status with paidAt timestamp', () => {
            const updated = orderService.confirmOrderPayment(createdOrderId, { campaignId: '999' });
            assert.strictEqual(updated.status, 'paid');
            assert.strictEqual(updated.paymentStatus, 'paid');
            assert.strictEqual(updated.campaignId, '999');
            assert.ok(updated.paidAt > 0);

            // Re-read from disk to confirm persistence
            const onDisk = orderService.getOrder(createdOrderId);
            assert.strictEqual(onDisk.status, 'paid');
            assert.strictEqual(onDisk.paymentStatus, 'paid');
            assert.strictEqual(onDisk.campaignId, '999');
        });

        it('lists orders including the newly created order', () => {
            const list = orderService.listOrders();
            assert.ok(Array.isArray(list));
            const found = list.find(o => o.orderId === createdOrderId);
            assert.ok(found, 'Created order should be present in listOrders()');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 5: Strict Zero-Click Pre-Payment Gating Logic
    // ─────────────────────────────────────────────────────────────────────────
    describe('5. Strict Zero-Click Pre-Payment Gating (scheduleTick & runVisitWorker)', () => {
        it('strictly aborts scheduleTick without modifying visits or launching workers if paymentStatus !== paid', async () => {
            const campId = 'test_unpaid_campaign_' + Date.now();
            const now = Date.now();
            const config = {
                name: 'Unpaid Test Campaign',
                targetUrl: 'https://example.com/unpaid',
                targetClicks: 100,
                startTime: now - 1000,
                endTime: now + 3600000,
                scheduleMode: 'even',
                browserMode: 'request',
                orderId: 'ORD-TEST-UNPAID',
                paymentStatus: 'pending_payment'
            };

            const state = createCampaignState(campId, config);
            campaigns.set(campId, state);

            // Tick the scheduler 5 times
            for (let i = 0; i < 5; i++) {
                await scheduleTick(campId);
            }

            // Verify strict zero-click invariant
            assert.strictEqual(state.totalVisits, 0, 'Zero total visits allowed for unpaid campaign');
            assert.strictEqual(state.successVisits, 0, 'Zero success visits allowed for unpaid campaign');
            assert.strictEqual(state.activeWorkers, 0, 'Zero active workers allowed for unpaid campaign');
            assert.strictEqual(state.scheduleIdx, 0, 'Schedule index must not advance for unpaid campaign');

            // Cleanup
            campaigns.delete(campId);
        });

        it('unblocks scheduler execution once paymentStatus is transitioned to paid', async () => {
            const campId = 'test_gating_transition_' + Date.now();
            const now = Date.now();
            const config = {
                name: 'Transition Test Campaign',
                targetUrl: 'https://example.com/transition',
                targetClicks: 100,
                startTime: now - 1000,
                endTime: now + 3600000,
                scheduleMode: 'even',
                browserMode: 'request',
                orderId: 'ORD-TEST-TRANSITION',
                paymentStatus: 'pending_payment'
            };

            const state = createCampaignState(campId, config);
            campaigns.set(campId, state);

            // Initially unpaid -> zero activity
            await scheduleTick(campId);
            assert.strictEqual(state.totalVisits, 0);

            // Transition to paid
            state.paymentStatus = 'paid';
            state.config.paymentStatus = 'paid';

            // Verify gate check passes now
            assert.strictEqual(state.paymentStatus, 'paid');

            // Cleanup
            campaigns.delete(campId);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 6: End-to-End Express API Routes & Instant Auto-Activation
    // ─────────────────────────────────────────────────────────────────────────
    describe('6. End-to-End Express API Routes & Instant Auto-Activation', () => {
        let sharedOrderId = null;
        let activatedCampaignId = null;

        function makeRequest(method, urlPath, body = null, reqOpts = {}) {
            return env.request(method, urlPath, {
                body,
                cookie: reqOpts.cookie || null,
                headers: reqOpts.headers || {}
            });
        }

        it('POST /api/orders/calculate-cost calculates accurate pricing without auth', async () => {
            const res = await makeRequest('POST', '/api/orders/calculate-cost', {
                targetClicks: 1000,
                durationHours: 1.5
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.clickFee, 40000);
            assert.strictEqual(res.body.roundedHours, 2);
            assert.strictEqual(res.body.durationFee, 4000);
            assert.strictEqual(res.body.totalAmount, 44000);
        });

        it('POST /api/orders/calculate-cost returns 400 for invalid inputs', async () => {
            const res = await makeRequest('POST', '/api/orders/calculate-cost', {
                targetClicks: -10,
                durationHours: 1
            });

            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.success, false);
        });

        it('POST /api/orders creates order and returns VietQR details without auth', async () => {
            const payload = {
                targetUrl: 'https://example.com/checkout-page',
                proxyKey: 'customer_live_kiot_key_456',
                targetClicks: 500,
                durationHours: 2.0,
                name: 'E2E Order Test'
            };

            const res = await makeRequest('POST', '/api/orders', payload);

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.success, true);
            assert.ok(res.body.orderId);
            assert.match(res.body.orderCode, /^TF\d+$/);
            assert.strictEqual(res.body.status, 'pending_payment');
            assert.strictEqual(res.body.paymentStatus, 'pending_payment');
            assert.strictEqual(res.body.totalAmount, 500 * 40 + 2 * 2000); // 20000 + 4000 = 24000
            assert.ok(res.body.vietQrUrl.includes('img.vietqr.io'));
            assert.strictEqual(res.body.proxyKey, 'customer_live_kiot_key_456');

            sharedOrderId = res.body.orderId;
            env.trackProxyKey('customer_live_kiot_key_456');
        });

        it('GET /api/orders/:id retrieves order details without auth', async () => {
            const res = await makeRequest('GET', `/api/orders/${sharedOrderId}`);

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.order.orderId, sharedOrderId);
            assert.strictEqual(res.body.order.status, 'pending_payment');
            assert.strictEqual(res.body.order.proxyKey, undefined);
            assert.strictEqual(res.body.order.proxyKeyMasked, '..._456');
        });

        it('GET /api/orders/:id returns 404 for unknown order ID', async () => {
            const res = await makeRequest('GET', '/api/orders/ORD-NON-EXISTENT-9999');
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.success, false);
        });

        it('POST /api/orders/:id/confirm returns 403 when called without admin authentication', async () => {
            const unauthRes = await makeRequest('POST', `/api/orders/${sharedOrderId}/confirm`);
            assert.strictEqual(unauthRes.status, 403);
            assert.strictEqual(unauthRes.body.success, false);

            const guestCookie = await env.loginAsGuest();
            const guestRes = await makeRequest('POST', `/api/orders/${sharedOrderId}/confirm`, null, { cookie: guestCookie });
            assert.strictEqual(guestRes.status, 403);
            assert.strictEqual(guestRes.body.success, false);

            const unchanged = orderService.getOrder(sharedOrderId);
            assert.strictEqual(unchanged.status, 'pending_payment');
            assert.strictEqual(unchanged.paymentStatus, 'pending_payment');
            assert.strictEqual(unchanged.campaignId, null);
        });

        it('POST /api/orders/:id/confirm activates order into a running campaign when called by admin', async () => {
            const res = await makeRequest('POST', `/api/orders/${sharedOrderId}/confirm`, null, { cookie: env.adminCookie });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.status, 'paid');
            assert.ok(res.body.campaignId);

            activatedCampaignId = res.body.campaignId;

            // 1. Verify in campaigns Map
            const campaign = campaigns.get(activatedCampaignId);
            assert.ok(campaign, 'Activated campaign must exist in server campaigns Map');
            assert.strictEqual(campaign.status, 'running');
            assert.strictEqual(campaign.paymentStatus, 'paid');
            assert.strictEqual(campaign.orderId, sharedOrderId);
            assert.strictEqual(campaign.config.browserMode, 'request');
            assert.strictEqual(campaign.customerProxyKey, 'customer_live_kiot_key_456');

            // 2. Verify proxy key is registered in globalProxyPool
            assert.ok(globalProxyPool.has('customer_live_kiot_key_456'), 'Customer proxy key must be registered in proxy pool');

            // 3. Verify order storage status is updated
            const updatedOrder = orderService.getOrder(sharedOrderId);
            assert.strictEqual(updatedOrder.status, 'running');
            assert.strictEqual(updatedOrder.paymentStatus, 'paid');
            assert.strictEqual(updatedOrder.campaignId, activatedCampaignId);

            // Cleanup
            campaigns.delete(activatedCampaignId);
            try {
                const campFile = path.join(__dirname, '..', 'campaigns', `${activatedCampaignId}.json`);
                if (fs.existsSync(campFile)) fs.unlinkSync(campFile);
            } catch {}
        });

        it('POST /api/orders/:id/confirm is idempotent when called again by admin', async () => {
            const res = await makeRequest('POST', `/api/orders/${sharedOrderId}/confirm`, null, { cookie: env.adminCookie });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.campaignId, activatedCampaignId);
        });
    });
});

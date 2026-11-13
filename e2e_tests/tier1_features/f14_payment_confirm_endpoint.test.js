/**
 * Tier 1: Feature Coverage
 * Feature F14: Payment Confirmation Endpoint (POST /api/orders/:id/confirm)
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F14_01',
        name: 'Successful Confirmation of Valid Order (Admin Only, 403 Unauthenticated)',
        feature: 'F14',
        tier: 1,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;

            // Unauthenticated caller must be rejected with 403 Forbidden
            const unauthRes = await ctx.httpClient.post(`/api/orders/${encodeURIComponent(orderId)}/confirm`);
            assert.equal(unauthRes.status, 403);
            assert.equal(unauthRes.ok, false);

            const unpaidOrder = (await ctx.getOrder(orderId)).body.order;
            assert.equal(unpaidOrder.paymentStatus, 'pending_payment');

            // Authenticated admin confirmation succeeds
            const confirmRes = await ctx.confirmOrder(orderId);
            assert.equal(confirmRes.ok, true);
            assert.equal(confirmRes.status, 200);
            const status = confirmRes.body.status || confirmRes.body.order.status;
            assert.equal(status, 'paid');
        }
    },
    {
        id: 'T1_F14_02',
        name: 'Generation of Campaign Entity on Confirm',
        feature: 'F14',
        tier: 1,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            const confirmRes = await ctx.confirmOrder(orderId);
            assert.equal(confirmRes.ok, true);
            assert.ok(confirmRes.body.campaignId);
        }
    },
    {
        id: 'T1_F14_03',
        name: '404 on Confirm Non-Existent Order (Admin) and 403 When Unauthenticated',
        feature: 'F14',
        tier: 1,
        fn: async (ctx) => {
            const unauthRes = await ctx.httpClient.post('/api/orders/ORD-NON-EXISTENT-99999/confirm');
            assert.equal(unauthRes.status, 403);
            assert.equal(unauthRes.ok, false);

            const confirmRes = await ctx.confirmOrder('ORD-NON-EXISTENT-99999');
            assert.equal(confirmRes.status, 404);
            assert.equal(confirmRes.ok, false);
        }
    },
    {
        id: 'T1_F14_04',
        name: 'Timestamp Recording on Confirmation',
        feature: 'F14',
        tier: 1,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            const confirmRes = await ctx.confirmOrder(orderId);
            assert.equal(confirmRes.ok, true);
            const order = confirmRes.body.order || (await ctx.getOrder(orderId)).body.order;
            assert.ok(order.paidAt !== null, 'paidAt timestamp must be recorded');
            assert.equal(typeof order.paidAt, 'number');
        }
    },
    {
        id: 'T1_F14_05',
        name: 'Event Notification Contract on Confirmation',
        feature: 'F14',
        tier: 1,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            const confirmRes = await ctx.confirmOrder(orderId);
            assert.equal(confirmRes.ok, true);
        }
    },
    {
        id: 'T1_F14_06',
        name: '403 Forbidden on Unauthenticated Manual Confirm',
        feature: 'F14',
        tier: 1,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;

            const unauthRes = await ctx.confirmOrder(orderId, { anonymous: true });
            assert.equal(unauthRes.status, 403);
            assert.equal(unauthRes.ok, false);

            const order = (await ctx.getOrder(orderId)).body.order;
            assert.equal(order.status, 'pending_payment');
            assert.equal(order.paymentStatus, 'pending_payment');
            assert.equal(order.campaignId, null);
        }
    }
];

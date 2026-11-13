/**
 * Tier 2: Boundary & Corner Cases
 * Feature F14: Payment Confirmation Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F14_01',
        name: 'Empty Order ID in Confirm Endpoint Fails with 404',
        feature: 'F14',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.confirmOrder('');
            assert.equal(res.status, 404);
        }
    },
    {
        id: 'T2_F14_02',
        name: 'Special Characters in Order ID Fails with 404 (Admin) and 403 (Unauthenticated)',
        feature: 'F14',
        tier: 2,
        fn: async (ctx) => {
            const unauthRes = await ctx.httpClient.post(`/api/orders/${encodeURIComponent('ORD-@#$%^&*')}/confirm`);
            assert.equal(unauthRes.status, 403);

            const res = await ctx.confirmOrder('ORD-@#$%^&*');
            assert.equal(res.status, 404);
        }
    },
    {
        id: 'T2_F14_03',
        name: 'Confirm Preserves Original Parameters (targetUrl, clicks, masked vs admin key)',
        feature: 'F14',
        tier: 2,
        fn: async (ctx) => {
            const key = 'kiot_param_check_key';
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com/unique',
                proxyKey: key,
                targetClicks: 120,
                durationHours: 1.5
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            const confirmRes = await ctx.confirmOrder(orderId);
            assert.equal(confirmRes.ok, true);

            const pubOrder = (await ctx.getOrder(orderId)).body.order;
            assert.equal(pubOrder.targetUrl, 'https://example.com/unique');
            assert.equal(pubOrder.targetClicks, 120);
            assert.equal(pubOrder.proxyKey, undefined, 'Public order query must mask proxyKey');
            assert.equal(pubOrder.proxyKeyMasked, `...${key.slice(-4)}`);

            const { res: adminRes, order: adminOrder } = await ctx.getAdminOrder(orderId);
            assert.equal(adminRes.ok, true);
            assert.ok(adminOrder);
            assert.equal(adminOrder.targetUrl, 'https://example.com/unique');
            assert.equal(adminOrder.targetClicks, 120);
            assert.equal(adminOrder.proxyKey, key);
            assert.equal(adminOrder.proxyKeyMasked, `...${key.slice(-4)}`);
        }
    },
    {
        id: 'T2_F14_04',
        name: 'Confirm Returns Updated paidAt Timestamp',
        feature: 'F14',
        tier: 2,
        fn: async (ctx) => {
            const before = Date.now();
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            await ctx.confirmOrder(orderId);
            const order = (await ctx.getOrder(orderId)).body.order;
            assert.ok(order.paidAt >= before);
        }
    },
    {
        id: 'T2_F14_05',
        name: 'Confirm Links Valid campaignId',
        feature: 'F14',
        tier: 2,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            const confirmRes = await ctx.confirmOrder(orderId);
            assert.ok(confirmRes.body.campaignId);
        }
    }
];

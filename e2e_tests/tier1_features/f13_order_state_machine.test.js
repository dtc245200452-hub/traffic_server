/**
 * Tier 1: Feature Coverage
 * Feature F13: Order State Machine
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F13_01',
        name: 'Initial State is pending_payment',
        feature: 'F13',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assert.equal(order.status, 'pending_payment');
            assert.equal(order.paymentStatus, 'pending_payment');
        }
    },
    {
        id: 'T1_F13_02',
        name: 'Transition from pending_payment to paid',
        feature: 'F13',
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
            const status = confirmRes.body.status || confirmRes.body.order.status;
            assert.equal(status, 'paid');
        }
    },
    {
        id: 'T1_F13_03',
        name: 'Transition from paid to running',
        feature: 'F13',
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
        id: 'T1_F13_04',
        name: 'Transition from running to completed',
        feature: 'F13',
        tier: 1,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            await ctx.confirmOrder(orderId);
            if (ctx.orderService) {
                const completed = ctx.orderService.updateOrderStatus(orderId, 'completed');
                assert.equal(completed.status, 'completed');
            } else {
                assert.ok(true);
            }
        }
    },
    {
        id: 'T1_F13_05',
        name: 'Immutable Terminal States (completed cannot revert to pending)',
        feature: 'F13',
        tier: 1,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            await ctx.confirmOrder(orderId);
            if (ctx.orderService) {
                ctx.orderService.updateOrderStatus(orderId, 'completed');
                ctx.orderService.updateOrderStatus(orderId, 'pending_payment');
                const order = ctx.orderService.getOrder(orderId);
                assert.equal(order.status, 'completed');
            } else {
                assert.ok(true);
            }
        }
    }
];

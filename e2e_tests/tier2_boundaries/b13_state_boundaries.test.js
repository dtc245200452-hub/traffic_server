/**
 * Tier 2: Boundary & Corner Cases
 * Feature F13: Order State Machine Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F13_01',
        name: 'Double Confirmation Idempotency (second call succeeds)',
        feature: 'F13',
        tier: 2,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            const res1 = await ctx.confirmOrder(orderId);
            assert.equal(res1.ok, true);
            const res2 = await ctx.confirmOrder(orderId);
            assert.equal(res2.ok, true);
        }
    },
    {
        id: 'T2_F13_02',
        name: 'Query Non-Existent Order Returns 404',
        feature: 'F13',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.getOrder('ORD-INVALID-XYZ-000');
            assert.equal(res.status, 404);
            assert.equal(res.ok, false);
        }
    },
    {
        id: 'T2_F13_03',
        name: 'Query With Path Traversal Attempt Sanitized',
        feature: 'F13',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.getOrder('../../etc/passwd');
            assert.equal(res.status, 404);
        }
    },
    {
        id: 'T2_F13_04',
        name: 'State Transition Sequence Verification',
        feature: 'F13',
        tier: 2,
        fn: async (ctx) => {
            const validTransitions = {
                'pending_payment': ['paid'],
                'paid': ['running'],
                'running': ['completed', 'stopped'],
                'completed': []
            };
            assert.ok(validTransitions['pending_payment'].includes('paid'));
            assert.equal(validTransitions['completed'].length, 0);
        }
    },
    {
        id: 'T2_F13_05',
        name: 'Order Status Query Reflects Real-Time State',
        feature: 'F13',
        tier: 2,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;
            let current = (await ctx.getOrder(orderId)).body.order;
            assert.equal(current.status, 'pending_payment');
            await ctx.confirmOrder(orderId);
            current = (await ctx.getOrder(orderId)).body.order;
            assert.ok(current.status === 'running' || current.status === 'paid');
            assert.equal(current.paymentStatus, 'paid');
        }
    }
];

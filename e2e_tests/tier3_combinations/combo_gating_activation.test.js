/**
 * Tier 3: Combinatorial Interactions
 * Suite 2: Pre-Payment Gating × Instant Auto-Activation
 */
const { assert, assertZeroClicks } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T3_COMBO_06',
        name: 'Gating × Activation: Zero visits while unpaid, transitions to running upon confirmation',
        feature: ['F13', 'F14', 'F16', 'F17'],
        tier: 3,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                targetUrl: ctx.mockTarget.url,
                proxyKey: 'kiot_gating_key_01',
                targetClicks: 10,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;

            // Wait 300ms, assert strictly zero clicks delivered
            await new Promise((r) => setTimeout(r, 300));
            const beforeOrder = (await ctx.getOrder(orderId)).body.order;
            assertZeroClicks(beforeOrder);
            assert.equal(beforeOrder.status, 'pending_payment');

            // Confirm payment
            const confirmRes = await ctx.confirmOrder(orderId);
            assert.equal(confirmRes.ok, true);
            const afterOrder = (await ctx.getOrder(orderId)).body.order;
            assert.equal(afterOrder.paymentStatus, 'paid');
            assert.ok(afterOrder.status === 'paid' || afterOrder.status === 'running');
        }
    },
    {
        id: 'T3_COMBO_07',
        name: 'Gating × Activation: Target mock server receives 0 requests before confirm',
        feature: ['F16', 'F17', 'F19'],
        tier: 3,
        fn: async (ctx) => {
            ctx.mockTarget.reset();
            const createRes = await ctx.createOrder({
                targetUrl: ctx.mockTarget.url,
                proxyKey: 'kiot_gating_key_02',
                targetClicks: 20,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;

            await new Promise((r) => setTimeout(r, 400));
            assert.equal(ctx.mockTarget.getRequestCount(), 0, 'Target server must have received 0 requests');

            await ctx.confirmOrder(orderId);
            const order = (await ctx.getOrder(orderId)).body.order;
            assert.equal(order.paymentStatus, 'paid');
        }
    },
    {
        id: 'T3_COMBO_08',
        name: 'Gating × Activation: KiotProxy receives 0 calls before confirm',
        feature: ['F16', 'F17', 'F18'],
        tier: 3,
        fn: async (ctx) => {
            ctx.mockKiot.reset();
            const createRes = await ctx.createOrder({
                targetUrl: ctx.mockTarget.url,
                proxyKey: 'kiot_gating_key_03',
                targetClicks: 25,
                durationHours: 1
            });
            const orderId = createRes.body.orderId || createRes.body.order.orderId;

            await new Promise((r) => setTimeout(r, 400));
            assert.equal(ctx.mockKiot.getCallCount(), 0, 'KiotProxy must have received 0 rotation calls');

            await ctx.confirmOrder(orderId);
        }
    },
    {
        id: 'T3_COMBO_09',
        name: 'Gating × Activation: Auto-activation generates valid execution timestamps',
        feature: ['F04', 'F14', 'F17'],
        tier: 3,
        fn: async (ctx) => {
            const timeDist = require('../../timeDistribution');
            const now = Date.now();
            const sched = timeDist.generateClickSchedule(now, now + 3600000, 15, 'smart');
            assert.equal(sched.length, 15);
            assert.ok(sched.every(t => t >= now && t <= now + 3600000));
        }
    }
];

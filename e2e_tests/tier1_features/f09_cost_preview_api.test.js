/**
 * Tier 1: Feature Coverage
 * Feature F09: Dynamic Cost Preview API
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F09_01',
        name: 'Dedicated Cost Calculation Endpoint Existence',
        feature: 'F09',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 250, durationHours: 1.2 });
            assert.equal(res.ok, true);
            assert.equal(res.body.totalAmount, 14000); // 250*40 + 2*2000 = 10000 + 4000
        }
    },
    {
        id: 'T1_F09_02',
        name: 'Returned Breakdown Properties',
        feature: 'F09',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 1 });
            assert.equal(res.ok, true);
            const b = res.body;
            assert.ok('targetClicks' in b);
            assert.ok('durationHours' in b);
            assert.ok('roundedHours' in b);
            assert.ok('clickFee' in b);
            assert.ok('durationFee' in b);
            assert.ok('totalAmount' in b);
        }
    },
    {
        id: 'T1_F09_03',
        name: 'Idempotency of Cost Preview',
        feature: 'F09',
        tier: 1,
        fn: async (ctx) => {
            const res1 = await ctx.calculateCost({ targetClicks: 100, durationHours: 1 });
            const res2 = await ctx.calculateCost({ targetClicks: 100, durationHours: 1 });
            assert.equal(res1.body.totalAmount, res2.body.totalAmount);
        }
    },
    {
        id: 'T1_F09_04',
        name: 'Fast In-Memory Response Time',
        feature: 'F09',
        tier: 1,
        fn: async (ctx) => {
            const start = Date.now();
            for (let i = 0; i < 5; i++) {
                await ctx.calculateCost({ targetClicks: 100 + i, durationHours: 1 });
            }
            const avgMs = (Date.now() - start) / 5;
            assert.ok(avgMs < 200, `Average calculation time was ${avgMs}ms, should be fast`);
        }
    },
    {
        id: 'T1_F09_05',
        name: 'Pricing Consistency with Order Creation',
        feature: 'F09',
        tier: 1,
        fn: async (ctx) => {
            const preview = await ctx.calculateCost({ targetClicks: 300, durationHours: 2 });
            const orderRes = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 300,
                durationHours: 2
            });
            const order = orderRes.body.order || orderRes.body;
            assert.equal(preview.body.totalAmount, order.totalAmount);
        }
    }
];

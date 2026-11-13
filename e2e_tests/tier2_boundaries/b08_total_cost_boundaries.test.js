/**
 * Tier 2: Boundary & Corner Cases
 * Feature F08: Total Order Cost Boundaries (Authoritative Table PR-01 to PR-18)
 */
const { assert, assertPricing } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F08_01',
        name: 'PR-01 Boundary: 1 click, 0.05h (3 min) = 2,040 VNĐ',
        feature: 'F08',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 1, durationHours: 0.05 });
            assert.equal(res.ok, true);
            assertPricing(res.body, 1, 0.05);
            assert.equal(res.body.totalAmount, 2040);
        }
    },
    {
        id: 'T2_F08_02',
        name: 'PR-05 Boundary: 100 clicks, 0.983h (59 min) = 6,000 VNĐ',
        feature: 'F08',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 0.983 });
            assert.equal(res.ok, true);
            assertPricing(res.body, 100, 0.983);
            assert.equal(res.body.totalAmount, 6000);
        }
    },
    {
        id: 'T2_F08_03',
        name: 'PR-07 Boundary: 100 clicks, 1.017h (61 min) = 8,000 VNĐ',
        feature: 'F08',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 1.017 });
            assert.equal(res.ok, true);
            assertPricing(res.body, 100, 1.017);
            assert.equal(res.body.totalAmount, 8000);
        }
    },
    {
        id: 'T2_F08_04',
        name: 'PR-11 Boundary: 1,000 clicks, 2.001h = 46,000 VNĐ',
        feature: 'F08',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 1000, durationHours: 2.001 });
            assert.equal(res.ok, true);
            assertPricing(res.body, 1000, 2.001);
            assert.equal(res.body.totalAmount, 46000);
        }
    },
    {
        id: 'T2_F08_05',
        name: 'PR-18 Boundary: 100,000 clicks, 168h = 4,336,000 VNĐ',
        feature: 'F08',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100000, durationHours: 168 });
            assert.equal(res.ok, true);
            assertPricing(res.body, 100000, 168);
            assert.equal(res.body.totalAmount, 4336000);
        }
    }
];

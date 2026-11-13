/**
 * Tier 1: Feature Coverage
 * Feature F08: Total Order Cost Calculation (ClickFee + DurationFee)
 */
const { assert, assertPricing } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F08_01',
        name: 'Minimal Order Cost (1 click, 0.1h = 2,040 VNĐ)',
        feature: 'F08',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 1, durationHours: 0.1 });
            assert.equal(res.ok, true);
            assertPricing(res.body, 1, 0.1);
            assert.equal(res.body.totalAmount, 2040);
        }
    },
    {
        id: 'T1_F08_02',
        name: '100 Clicks, 1 Hour Order (4,000 + 2,000 = 6,000 VNĐ)',
        feature: 'F08',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 1 });
            assert.equal(res.ok, true);
            assertPricing(res.body, 100, 1);
            assert.equal(res.body.totalAmount, 6000);
        }
    },
    {
        id: 'T1_F08_03',
        name: '500 Clicks, 1.5 Hours Order (20,000 + 4,000 = 24,000 VNĐ)',
        feature: 'F08',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 500, durationHours: 1.5 });
            assert.equal(res.ok, true);
            assertPricing(res.body, 500, 1.5);
            assert.equal(res.body.totalAmount, 24000);
        }
    },
    {
        id: 'T1_F08_04',
        name: '1,000 Clicks, 2 Hours Order (40,000 + 4,000 = 44,000 VNĐ)',
        feature: 'F08',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 1000, durationHours: 2 });
            assert.equal(res.ok, true);
            assertPricing(res.body, 1000, 2);
            assert.equal(res.body.totalAmount, 44000);
        }
    },
    {
        id: 'T1_F08_05',
        name: '5,000 Clicks, 5.5 Hours Order (200,000 + 12,000 = 212,000 VNĐ)',
        feature: 'F08',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 5000, durationHours: 5.5 });
            assert.equal(res.ok, true);
            assertPricing(res.body, 5000, 5.5);
            assert.equal(res.body.totalAmount, 212000);
        }
    }
];

/**
 * Tier 2: Boundary & Corner Cases
 * Feature F07: Duration Ceiling Rounding Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F07_01',
        name: 'Micro-hour Rounding (0.001h = 3.6s -> 1h = 2,000 VNĐ)',
        feature: 'F07',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 0.001 });
            assert.equal(res.ok, true);
            assert.equal(res.body.roundedHours, 1);
            assert.equal(res.body.durationFee, 2000);
        }
    },
    {
        id: 'T2_F07_02',
        name: 'Epsilon Below 1-Hour (0.999h -> 1h = 2,000 VNĐ)',
        feature: 'F07',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 0.999 });
            assert.equal(res.ok, true);
            assert.equal(res.body.roundedHours, 1);
            assert.equal(res.body.durationFee, 2000);
        }
    },
    {
        id: 'T2_F07_03',
        name: 'Exact 1.000 Hour Boundary (1.0h -> 1h = 2,000 VNĐ)',
        feature: 'F07',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 1.000 });
            assert.equal(res.ok, true);
            assert.equal(res.body.roundedHours, 1);
            assert.equal(res.body.durationFee, 2000);
        }
    },
    {
        id: 'T2_F07_04',
        name: 'Epsilon Above 1-Hour (1.000001h -> 2h = 4,000 VNĐ)',
        feature: 'F07',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 1.000001 });
            assert.equal(res.ok, true);
            assert.equal(res.body.roundedHours, 2);
            assert.equal(res.body.durationFee, 4000);
        }
    },
    {
        id: 'T2_F07_05',
        name: 'Epsilon Above 24-Hour (24.001h -> 25h = 50,000 VNĐ)',
        feature: 'F07',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 24.001 });
            assert.equal(res.ok, true);
            assert.equal(res.body.roundedHours, 25);
            assert.equal(res.body.durationFee, 50000);
        }
    }
];

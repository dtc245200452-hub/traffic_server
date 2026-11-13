/**
 * Tier 1: Feature Coverage
 * Feature F07: Duration Fee with Ceiling Rounding (Math.ceil(H) * 2000 VNĐ)
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F07_01',
        name: 'Sub-hour Duration Ceiling (0.2h -> 1h = 2,000 VNĐ)',
        feature: 'F07',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 0.2 });
            assert.equal(res.ok, true);
            assert.equal(res.body.roundedHours, 1);
            assert.equal(res.body.durationFee, 2000);
        }
    },
    {
        id: 'T1_F07_02',
        name: 'Exactly 1.0 Hour (1.0h -> 1h = 2,000 VNĐ)',
        feature: 'F07',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 1.0 });
            assert.equal(res.ok, true);
            assert.equal(res.body.roundedHours, 1);
            assert.equal(res.body.durationFee, 2000);
        }
    },
    {
        id: 'T1_F07_03',
        name: '1.5 Hours Ceiling (1.5h -> 2h = 4,000 VNĐ)',
        feature: 'F07',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 1.5 });
            assert.equal(res.ok, true);
            assert.equal(res.body.roundedHours, 2);
            assert.equal(res.body.durationFee, 4000);
        }
    },
    {
        id: 'T1_F07_04',
        name: 'Exactly 2.0 Hours (2.0h -> 2h = 4,000 VNĐ)',
        feature: 'F07',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 2.0 });
            assert.equal(res.ok, true);
            assert.equal(res.body.roundedHours, 2);
            assert.equal(res.body.durationFee, 4000);
        }
    },
    {
        id: 'T1_F07_05',
        name: 'Multi-hour Ceiling (3.1h -> 4h = 8,000 VNĐ)',
        feature: 'F07',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 3.1 });
            assert.equal(res.ok, true);
            assert.equal(res.body.roundedHours, 4);
            assert.equal(res.body.durationFee, 8000);
        }
    }
];

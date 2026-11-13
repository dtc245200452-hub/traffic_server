/**
 * Tier 2: Boundary & Corner Cases
 * Feature F09: Preview API Parameter Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F09_01',
        name: 'Missing targetClicks Rejected with 400',
        feature: 'F09',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ durationHours: 1.5 });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F09_02',
        name: 'Missing durationHours Rejected with 400',
        feature: 'F09',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100 });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F09_03',
        name: 'Duration in Minutes (durationMinutes = 90 -> 1.5h -> 2h) Accepted',
        feature: 'F09',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 1000, durationMinutes: 90 });
            assert.equal(res.ok, true);
            assert.equal(res.body.roundedHours, 2);
            assert.equal(res.body.totalAmount, 44000);
        }
    },
    {
        id: 'T2_F09_04',
        name: 'Negative Duration Rejected with 400',
        feature: 'F09',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: -2 });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F09_05',
        name: 'Empty Body Object Rejected with 400',
        feature: 'F09',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({});
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    }
];

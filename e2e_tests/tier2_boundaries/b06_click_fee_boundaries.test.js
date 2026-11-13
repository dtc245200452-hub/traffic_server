/**
 * Tier 2: Boundary & Corner Cases
 * Feature F06: Click Fee Calculation Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F06_01',
        name: 'Single Click Fee (1 click = 40 VNĐ)',
        feature: 'F06',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 1, durationHours: 1 });
            assert.equal(res.ok, true);
            assert.equal(res.body.clickFee, 40);
        }
    },
    {
        id: 'T2_F06_02',
        name: 'Zero Click Fee Rejected (throws 400)',
        feature: 'F06',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 0, durationHours: 1 });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F06_03',
        name: 'Negative Click Fee Rejected (throws 400)',
        feature: 'F06',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: -10, durationHours: 1 });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F06_04',
        name: 'Float Click Fee Rejected (throws 400)',
        feature: 'F06',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 99.9, durationHours: 1 });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F06_05',
        name: 'High-Volume Click Fee (1,000,000 clicks = 40,000,000 VNĐ)',
        feature: 'F06',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 1000000, durationHours: 1 });
            assert.equal(res.ok, true);
            assert.equal(res.body.clickFee, 40000000);
        }
    }
];

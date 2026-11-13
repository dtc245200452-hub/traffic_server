/**
 * Tier 1: Feature Coverage
 * Feature F06: Click Fee Calculation (clicks * 40 VNĐ)
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F06_01',
        name: 'Single Click Fee (1 click = 40 VNĐ)',
        feature: 'F06',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 1, durationHours: 1 });
            assert.equal(res.ok, true);
            assert.equal(res.body.clickFee, 40);
        }
    },
    {
        id: 'T1_F06_02',
        name: '100 Clicks Fee (100 * 40 = 4,000 VNĐ)',
        feature: 'F06',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 100, durationHours: 1 });
            assert.equal(res.ok, true);
            assert.equal(res.body.clickFee, 4000);
        }
    },
    {
        id: 'T1_F06_03',
        name: '1,000 Clicks Fee (1,000 * 40 = 40,000 VNĐ)',
        feature: 'F06',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 1000, durationHours: 1 });
            assert.equal(res.ok, true);
            assert.equal(res.body.clickFee, 40000);
        }
    },
    {
        id: 'T1_F06_04',
        name: '2,500 Clicks Fee (2,500 * 40 = 100,000 VNĐ)',
        feature: 'F06',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 2500, durationHours: 1 });
            assert.equal(res.ok, true);
            assert.equal(res.body.clickFee, 100000);
        }
    },
    {
        id: 'T1_F06_05',
        name: '10,000 Clicks Fee (10,000 * 40 = 400,000 VNĐ)',
        feature: 'F06',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.calculateCost({ targetClicks: 10000, durationHours: 1 });
            assert.equal(res.ok, true);
            assert.equal(res.body.clickFee, 400000);
        }
    }
];

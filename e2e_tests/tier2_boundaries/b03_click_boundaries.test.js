/**
 * Tier 2: Boundary & Corner Cases
 * Feature F03: Click Count Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F03_01',
        name: 'Zero Click Count Rejected',
        feature: 'F03',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 0,
                durationHours: 1
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F03_02',
        name: 'Negative Click Count Rejected',
        feature: 'F03',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: -50,
                durationHours: 1
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F03_03',
        name: 'Floating Point Click Count Rejected',
        feature: 'F03',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 10.5,
                durationHours: 1
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F03_04',
        name: 'Non-numeric String Click Count Rejected',
        feature: 'F03',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 'one_hundred',
                durationHours: 1
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F03_05',
        name: 'Upper Boundary 1,000,000 Clicks Accepted',
        feature: 'F03',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 1000000,
                durationHours: 72
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.targetClicks, 1000000);
            assert.equal(order.clickFee, 40000000);
        }
    }
];

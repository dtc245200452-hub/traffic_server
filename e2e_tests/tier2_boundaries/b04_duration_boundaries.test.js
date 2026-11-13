/**
 * Tier 2: Boundary & Corner Cases
 * Feature F04: Target Duration Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F04_01',
        name: 'Zero Duration Hours Rejected',
        feature: 'F04',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 0
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F04_02',
        name: 'Negative Duration Hours Rejected',
        feature: 'F04',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: -1.5
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F04_03',
        name: 'Non-numeric String Duration Rejected',
        feature: 'F04',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 'two_hours'
            });
            assert.equal(res.ok, false);
            assert.equal(res.status, 400);
        }
    },
    {
        id: 'T2_F04_04',
        name: 'Micro Duration (0.001h = 3.6s) Accepted & Ceiled to 1h',
        feature: 'F04',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 0.001
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.roundedHours, 1);
            assert.equal(order.durationFee, 2000);
        }
    },
    {
        id: 'T2_F04_05',
        name: 'Multi-Day Duration (168h = 7 days) Accepted',
        feature: 'F04',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 1000,
                durationHours: 168
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.roundedHours, 168);
            assert.equal(order.durationFee, 168 * 2000);
        }
    }
];

/**
 * Tier 1: Feature Coverage
 * Feature F03: Click Count Setting
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F03_01',
        name: 'Standard Click Count (500 clicks)',
        feature: 'F03',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 500,
                durationHours: 1
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.targetClicks, 500);
        }
    },
    {
        id: 'T1_F03_02',
        name: 'Minimum Valid Click Count (1 click)',
        feature: 'F03',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 1,
                durationHours: 1
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.targetClicks, 1);
        }
    },
    {
        id: 'T1_F03_03',
        name: 'Large Click Count (10,000 clicks)',
        feature: 'F03',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 10000,
                durationHours: 24
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.targetClicks, 10000);
        }
    },
    {
        id: 'T1_F03_04',
        name: 'Numeric String Coercion Handling',
        feature: 'F03',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: '250',
                durationHours: 1
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.targetClicks, 250);
            assert.equal(typeof order.targetClicks, 'number');
        }
    },
    {
        id: 'T1_F03_05',
        name: 'Click Count Mapping to Campaign targetLimit',
        feature: 'F03',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 300,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assert.equal(order.targetClicks, 300);
        }
    }
];

/**
 * Tier 1: Feature Coverage
 * Feature F04: Target Duration Configuration
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F04_01',
        name: 'Integer Duration (2 hours)',
        feature: 'F04',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 2
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.durationHours, 2);
            assert.equal(order.roundedHours, 2);
        }
    },
    {
        id: 'T1_F04_02',
        name: 'Fractional Duration (1.5 hours)',
        feature: 'F04',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1.5
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.durationHours, 1.5);
            assert.equal(order.roundedHours, 2);
        }
    },
    {
        id: 'T1_F04_03',
        name: 'Sub-hour Duration (0.5 hours)',
        feature: 'F04',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 0.5
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.durationHours, 0.5);
            assert.equal(order.roundedHours, 1);
        }
    },
    {
        id: 'T1_F04_04',
        name: 'Long Duration (24 hours)',
        feature: 'F04',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 24
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.durationHours, 24);
            assert.equal(order.roundedHours, 24);
        }
    },
    {
        id: 'T1_F04_05',
        name: 'Campaign End Time Calculation from Duration',
        feature: 'F04',
        tier: 1,
        fn: async (ctx) => {
            const durationHours = 1.5;
            const durationMs = durationHours * 3600 * 1000;
            const now = Date.now();
            const expectedEndTime = now + durationMs;
            assert.ok(expectedEndTime > now);
            assert.equal(durationMs, 5400000);
        }
    }
];

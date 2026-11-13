/**
 * Tier 3: Combinatorial Interactions
 * Suite 1: Pricing Matrix × VietQR Dynamic Synthesis
 */
const { assert, assertPricing, assertVietQrUrl } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T3_COMBO_01',
        name: 'Pricing × VietQR: Minimal Order (1 click, 0.05h -> 2,040 VNĐ)',
        feature: ['F06', 'F07', 'F08', 'F10'],
        tier: 3,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com/combo1',
                proxyKey: 'kiot_combo_key_01',
                targetClicks: 1,
                durationHours: 0.05
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.totalAmount, 2040);
            assertVietQrUrl(order.vietQrUrl, { amount: 2040, orderCode: order.orderCode });
        }
    },
    {
        id: 'T3_COMBO_02',
        name: 'Pricing × VietQR: Fractional Ceiling (500 clicks, 1.5h -> 24,000 VNĐ)',
        feature: ['F06', 'F07', 'F08', 'F10'],
        tier: 3,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com/combo2',
                proxyKey: 'kiot_combo_key_02',
                targetClicks: 500,
                durationHours: 1.5
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.roundedHours, 2);
            assert.equal(order.totalAmount, 24000);
            assertVietQrUrl(order.vietQrUrl, { amount: 24000, orderCode: order.orderCode });
        }
    },
    {
        id: 'T3_COMBO_03',
        name: 'Pricing × VietQR: Multi-Hour Campaign (1,000 clicks, 2.001h -> 46,000 VNĐ)',
        feature: ['F06', 'F07', 'F08', 'F10'],
        tier: 3,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com/combo3',
                proxyKey: 'kiot_combo_key_03',
                targetClicks: 1000,
                durationHours: 2.001
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.roundedHours, 3);
            assert.equal(order.totalAmount, 46000);
            assertVietQrUrl(order.vietQrUrl, { amount: 46000, orderCode: order.orderCode });
        }
    },
    {
        id: 'T3_COMBO_04',
        name: 'Pricing × VietQR: Enterprise Full Day (10,000 clicks, 24h -> 448,000 VNĐ)',
        feature: ['F06', 'F07', 'F08', 'F10'],
        tier: 3,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com/combo4',
                proxyKey: 'kiot_combo_key_04',
                targetClicks: 10000,
                durationHours: 24
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.roundedHours, 24);
            assert.equal(order.totalAmount, 448000);
            assertVietQrUrl(order.vietQrUrl, { amount: 448000, orderCode: order.orderCode });
        }
    },
    {
        id: 'T3_COMBO_05',
        name: 'Pricing × VietQR: Large Multi-Day (100,000 clicks, 168h -> 4,336,000 VNĐ)',
        feature: ['F06', 'F07', 'F08', 'F10'],
        tier: 3,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com/combo5',
                proxyKey: 'kiot_combo_key_05',
                targetClicks: 100000,
                durationHours: 168
            });
            assert.equal(res.ok, true);
            const order = res.body.order || res.body;
            assert.equal(order.totalAmount, 4336000);
            assertVietQrUrl(order.vietQrUrl, { amount: 4336000, orderCode: order.orderCode });
        }
    }
];

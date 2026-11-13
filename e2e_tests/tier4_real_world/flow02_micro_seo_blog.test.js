/**
 * Tier 4: Real-World Customer Workloads
 * Flow 2: Micro SEO Blog Campaign (Sub-hour Ceiling Rounding)
 */
const { assert, assertPricing, assertVietQrUrl } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T4_FLOW_02',
        name: 'Micro SEO Blog: 50 clicks in 15 minutes (0.25h -> 1h ceil)',
        feature: ['F01', 'F03', 'F04', 'F06', 'F07', 'F08', 'F10', 'F14'],
        tier: 4,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                name: 'SEO Blog Boost',
                targetUrl: `${ctx.mockTarget.url}/seo-post-99`,
                proxyKey: 'kiot_seo_key_01',
                targetClicks: 50,
                durationHours: 0.25
            });
            assert.equal(createRes.ok, true);
            const order = createRes.body.order || createRes.body;

            // 50 * 40 = 2,000 VNĐ; ceil(0.25) = 1h * 2,000 = 2,000 VNĐ; Total = 4,000 VNĐ
            assertPricing(order, 50, 0.25);
            assert.equal(order.roundedHours, 1);
            assert.equal(order.clickFee, 2000);
            assert.equal(order.durationFee, 2000);
            assert.equal(order.totalAmount, 4000);

            assertVietQrUrl(order.vietQrUrl, { amount: 4000, orderCode: order.orderCode });

            const confirmRes = await ctx.confirmOrder(order.orderId);
            assert.equal(confirmRes.ok, true);
        }
    }
];

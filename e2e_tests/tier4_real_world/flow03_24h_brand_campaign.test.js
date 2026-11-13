/**
 * Tier 4: Real-World Customer Workloads
 * Flow 3: 24-Hour Brand Awareness Campaign
 */
const { assert, assertPricing, assertVietQrUrl } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T4_FLOW_03',
        name: '24-Hour Brand Campaign: 2,500 clicks over 24 hours',
        feature: ['F01', 'F03', 'F04', 'F06', 'F07', 'F08', 'F10', 'F17'],
        tier: 4,
        fn: async (ctx) => {
            const createRes = await ctx.createOrder({
                name: 'Brand Awareness 24h',
                targetUrl: `${ctx.mockTarget.url}/brand`,
                proxyKey: 'kiot_brand_key_24h',
                targetClicks: 2500,
                durationHours: 24
            });
            assert.equal(createRes.ok, true);
            const order = createRes.body.order || createRes.body;

            // 2500 * 40 = 100,000 VNĐ; 24h * 2,000 = 48,000 VNĐ; Total = 148,000 VNĐ
            assertPricing(order, 2500, 24);
            assert.equal(order.roundedHours, 24);
            assert.equal(order.clickFee, 100000);
            assert.equal(order.durationFee, 48000);
            assert.equal(order.totalAmount, 148000);

            assertVietQrUrl(order.vietQrUrl, { amount: 148000, orderCode: order.orderCode });

            // Confirm payment & verify schedule creation across full 24h window
            const confirmRes = await ctx.confirmOrder(order.orderId);
            assert.equal(confirmRes.ok, true);

            const timeDist = require('../../timeDistribution');
            const now = Date.now();
            const sched = timeDist.generateClickSchedule(now, now + (24 * 3600000), 2500, 'smart');
            assert.equal(sched.length, 2500);
            assert.ok(sched[sched.length - 1] > now + (20 * 3600000));
        }
    }
];

/**
 * Tier 4: Real-World Customer Workloads
 * Flow 1: E-Commerce Flash Sale (High Velocity Burst)
 */
const { assert, assertPricing, assertVietQrUrl } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T4_FLOW_01',
        name: 'E-Commerce Flash Sale: 1,000 clicks in 1 hour',
        feature: ['F01', 'F02', 'F03', 'F04', 'F06', 'F07', 'F08', 'F10', 'F14', 'F17'],
        tier: 4,
        fn: async (ctx) => {
            // Step 1: Create commercial order
            const createRes = await ctx.createOrder({
                name: 'Flash Sale Campaign',
                targetUrl: `${ctx.mockTarget.url}/flash-sale`,
                proxyKey: 'kiot_live_flash_key',
                targetClicks: 1000,
                durationHours: 1
            });
            assert.equal(createRes.ok, true);
            const order = createRes.body.order || createRes.body;

            // Step 2: Validate cost math: 1,000 * 40 + 1 * 2,000 = 42,000 VNĐ
            assertPricing(order, 1000, 1);
            assert.equal(order.totalAmount, 42000);

            // Step 3: Validate dynamic VietQR
            assertVietQrUrl(order.vietQrUrl, { amount: 42000, orderCode: order.orderCode });

            // Step 4: Confirm payment
            const confirmRes = await ctx.confirmOrder(order.orderId);
            assert.equal(confirmRes.ok, true);
            const confirmedOrder = (await ctx.getOrder(order.orderId)).body.order;
            assert.equal(confirmedOrder.paymentStatus, 'paid');
            assert.ok(confirmedOrder.status === 'paid' || confirmedOrder.status === 'running');
        }
    }
];

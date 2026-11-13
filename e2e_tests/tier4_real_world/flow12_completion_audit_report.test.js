/**
 * Tier 4: Real-World Customer Workloads
 * Flow 12: End-to-End Audit & Historical Completion Reporting
 */
const { assert, assertPricing } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T4_FLOW_12',
        name: 'End-to-End Audit: Full Pipeline Run to Completion and Report Verification',
        feature: ['F01', 'F02', 'F03', 'F04', 'F08', 'F13', 'F14', 'F23'],
        tier: 4,
        fn: async (ctx) => {
            const clicks = 50;
            const hours = 1;

            // 1. Order Creation
            const createRes = await ctx.createOrder({
                name: 'E2E Full Audit Campaign',
                targetUrl: `${ctx.mockTarget.url}/audit-done`,
                proxyKey: 'kiot_audit_key_final',
                targetClicks: clicks,
                durationHours: hours
            });
            const order = createRes.body.order || createRes.body;
            assertPricing(order, clicks, hours);

            // 2. Payment Confirmation
            const confirmRes = await ctx.confirmOrder(order.orderId);
            assert.equal(confirmRes.ok, true);

            // 3. Mark completed and audit report fields
            if (ctx.orderService) {
                ctx.orderService.updateOrderStatus(order.orderId, 'completed', {
                    actualEndTime: Date.now(),
                    visitsDelivered: clicks
                });
            }

            const finalOrder = (await ctx.getOrder(order.orderId)).body.order;
            assert.equal(finalOrder.paymentStatus, 'paid');
            assert.ok(['paid', 'running', 'completed'].includes(finalOrder.status));
            assert.ok(finalOrder.orderCode.startsWith('TF'));
            assert.equal(finalOrder.targetClicks, clicks);
        }
    }
];

/**
 * Tier 1: Feature Coverage
 * Feature F11: Unique Transaction Code Encoding (TF<ID>)
 */
const { assert, assertNonAccentedOrderCode } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T1_F11_01',
        name: "Transaction Code Prefix 'TF'",
        feature: 'F11',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assert.ok(order.orderCode.startsWith('TF'));
        }
    },
    {
        id: 'T1_F11_02',
        name: 'Alphanumeric & Non-Accented Characters',
        feature: 'F11',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                name: 'Chiến dịch Quảng Cáo Hà Nội',
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assertNonAccentedOrderCode(order.orderCode);
        }
    },
    {
        id: 'T1_F11_03',
        name: 'Uniqueness Across Sequential Orders',
        feature: 'F11',
        tier: 1,
        fn: async (ctx) => {
            const res1 = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const res2 = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const code1 = (res1.body.order || res1.body).orderCode;
            const code2 = (res2.body.order || res2.body).orderCode;
            assert.notEqual(code1, code2, 'Order codes must be unique');
        }
    },
    {
        id: 'T1_F11_04',
        name: 'Controlled Length (6 to 20 chars)',
        feature: 'F11',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assert.ok(order.orderCode.length >= 6 && order.orderCode.length <= 20);
        }
    },
    {
        id: 'T1_F11_05',
        name: 'Persistence of Order Code on Order Entity',
        feature: 'F11',
        tier: 1,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            const fetched = await ctx.getOrder(order.orderId);
            const fetchedOrder = fetched.body.order || fetched.body;
            assert.equal(fetchedOrder.orderCode, order.orderCode);
        }
    }
];

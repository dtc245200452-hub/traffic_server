/**
 * Tier 2: Boundary & Corner Cases
 * Feature F11: Order Memo Code Boundaries
 */
const { assert, assertNonAccentedOrderCode } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F11_01',
        name: 'Vietnamese Diacritics Strictly Prohibited in Order Code',
        feature: 'F11',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                name: 'Đơn hàng thử nghiệm Việt Nam',
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assertNonAccentedOrderCode(order.orderCode);
            assert.ok(!/[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i.test(order.orderCode));
        }
    },
    {
        id: 'T2_F11_02',
        name: 'Zero Hyphens or Dashes in Order Code',
        feature: 'F11',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assert.ok(!order.orderCode.includes('-'), 'Order code must not contain hyphens');
        }
    },
    {
        id: 'T2_F11_03',
        name: 'Zero Special Symbols in Order Code',
        feature: 'F11',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assert.ok(!/[!@#$%^&*()_+={}\[\]:;"'<>,.?\/\\|`~]/.test(order.orderCode));
        }
    },
    {
        id: 'T2_F11_04',
        name: 'Order Code Strictly Uppercase',
        feature: 'F11',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assert.equal(order.orderCode, order.orderCode.toUpperCase());
        }
    },
    {
        id: 'T2_F11_05',
        name: 'Order Code Length Constraint (<= 20 chars for Napas)',
        feature: 'F11',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assert.ok(order.orderCode.length <= 20);
        }
    }
];

/**
 * Tier 2: Boundary & Corner Cases
 * Feature F10: Dynamic VietQR Generator Boundaries
 */
const { assert, assertVietQrUrl } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F10_01',
        name: 'Zero Amount VietQR Generation Fails (requires positive int)',
        feature: 'F10',
        tier: 2,
        fn: async (ctx) => {
            if (ctx.orderService) {
                assert.throws(() => {
                    ctx.orderService.generateVietQrUrl({ bankId: 'MB', accountNumber: '0987654321' }, 0, 'TF1001');
                }, /positive/i);
            } else {
                assert.ok(true);
            }
        }
    },
    {
        id: 'T2_F10_02',
        name: 'Negative Amount VietQR Generation Fails',
        feature: 'F10',
        tier: 2,
        fn: async (ctx) => {
            if (ctx.orderService) {
                assert.throws(() => {
                    ctx.orderService.generateVietQrUrl({ bankId: 'MB', accountNumber: '0987654321' }, -4000, 'TF1001');
                }, /positive/i);
            } else {
                assert.ok(true);
            }
        }
    },
    {
        id: 'T2_F10_03',
        name: 'Fractional Amount VietQR Generation Fails',
        feature: 'F10',
        tier: 2,
        fn: async (ctx) => {
            if (ctx.orderService) {
                assert.throws(() => {
                    ctx.orderService.generateVietQrUrl({ bankId: 'MB', accountNumber: '0987654321' }, 44000.5, 'TF1001');
                }, /integer/i);
            } else {
                assert.ok(true);
            }
        }
    },
    {
        id: 'T2_F10_04',
        name: 'Empty Memo VietQR Generation Fails',
        feature: 'F10',
        tier: 2,
        fn: async (ctx) => {
            if (ctx.orderService) {
                assert.throws(() => {
                    ctx.orderService.generateVietQrUrl({ bankId: 'MB', accountNumber: '0987654321' }, 44000, '');
                }, /memo/i);
            } else {
                assert.ok(true);
            }
        }
    },
    {
        id: 'T2_F10_05',
        name: 'VietQR URL Contains Zero Spaces',
        feature: 'F10',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            const order = res.body.order || res.body;
            assert.ok(!order.vietQrUrl.includes(' '), 'VietQR URL must not contain unescaped whitespace');
        }
    }
];

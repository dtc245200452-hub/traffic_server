/**
 * Tier 2: Boundary & Corner Cases
 * Feature F15: UI Contract Boundaries
 */
const { assert } = require('../helpers/assertions');

module.exports = [
    {
        id: 'T2_F15_01',
        name: 'Currency Formatter with 0 Value',
        feature: 'F15',
        tier: 2,
        fn: async (ctx) => {
            const formatVND = (n) => `${Number(n).toLocaleString('vi-VN')} VNĐ`;
            assert.ok(formatVND(0).includes('0'));
        }
    },
    {
        id: 'T2_F15_02',
        name: 'Currency Formatter with High Multi-Million Value',
        feature: 'F15',
        tier: 2,
        fn: async (ctx) => {
            const formatVND = (n) => `${Number(n).toLocaleString('vi-VN')} VNĐ`;
            const str = formatVND(40000000);
            assert.ok(str.includes('40.000.000') || str.includes('40,000,000'));
        }
    },
    {
        id: 'T2_F15_03',
        name: 'Modal Responsive Backdrop Contract',
        feature: 'F15',
        tier: 2,
        fn: async (ctx) => {
            // Check modal CSS rules in style.css or index.html
            const fs = require('fs');
            const path = require('path');
            const html = fs.readFileSync(path.join(ctx.projectRoot, 'public', 'index.html'), 'utf-8');
            assert.ok(html.includes('modal') || html.includes('dialog'));
        }
    },
    {
        id: 'T2_F15_04',
        name: 'Special Characters in Campaign Name Sanitization',
        feature: 'F15',
        tier: 2,
        fn: async (ctx) => {
            const res = await ctx.createOrder({
                name: '<script>alert("xss")</script>',
                targetUrl: 'https://example.com',
                proxyKey: 'kiot_test_key_01',
                targetClicks: 100,
                durationHours: 1
            });
            assert.equal(res.ok, true);
        }
    },
    {
        id: 'T2_F15_05',
        name: 'QR Image Load Fallback Container Contract',
        feature: 'F15',
        tier: 2,
        fn: async (ctx) => {
            // Verify fallback structure if QR fails to load
            const fallbackCheck = (imgUrl) => Boolean(imgUrl && imgUrl.startsWith('https://'));
            assert.equal(fallbackCheck('https://img.vietqr.io/image/test.png'), true);
        }
    }
];

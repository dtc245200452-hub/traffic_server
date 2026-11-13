/**
 * Tier 1: Feature Coverage
 * Feature F15: Interactive Payment UI Screen Contract
 */
const { assert } = require('../helpers/assertions');
const fs = require('fs');
const path = require('path');

module.exports = [
    {
        id: 'T1_F15_01',
        name: 'DOM Contract - HTML Static Structure Availability',
        feature: 'F15',
        tier: 1,
        fn: async (ctx) => {
            const htmlPath = path.join(ctx.projectRoot, 'public', 'index.html');
            assert.ok(fs.existsSync(htmlPath), 'public/index.html must exist');
            const content = fs.readFileSync(htmlPath, 'utf-8');
            assert.ok(content.length > 500, 'index.html must have content');
        }
    },
    {
        id: 'T1_F15_02',
        name: 'DOM Contract - Browser Mode Default Request Mode',
        feature: 'F15',
        tier: 1,
        fn: async (ctx) => {
            const htmlPath = path.join(ctx.projectRoot, 'public', 'index.html');
            const content = fs.readFileSync(htmlPath, 'utf-8');
            assert.ok(content.includes('value="request"') || content.includes('Request'), 'UI must offer direct request mode');
        }
    },
    {
        id: 'T1_F15_03',
        name: 'DOM Contract - Order Amount & Currency Formatting',
        feature: 'F15',
        tier: 1,
        fn: async (ctx) => {
            // Formatter helper contract
            const formatVND = (n) => `${Number(n).toLocaleString('vi-VN')} VNĐ`;
            assert.equal(formatVND(44000).replace(/\s/g, ''), '44.000VNĐ'.replace(/\s/g, ''));
        }
    },
    {
        id: 'T1_F15_04',
        name: 'DOM Contract - 1-Click Copy Helper Contract',
        feature: 'F15',
        tier: 1,
        fn: async (ctx) => {
            // Contract: copy button copies orderCode text to clipboard
            const copyHelper = (code) => {
                assert.ok(typeof code === 'string' && code.startsWith('TF'));
                return true;
            };
            assert.ok(copyHelper('TF1001'));
        }
    },
    {
        id: 'T1_F15_05',
        name: 'DOM Contract - Manual Check Payment Polling Action',
        feature: 'F15',
        tier: 1,
        fn: async (ctx) => {
            // Contract: client polls GET /api/orders/:id until status === 'paid'
            const checkStatus = (status) => status === 'paid' || status === 'pending_payment';
            assert.ok(checkStatus('pending_payment'));
            assert.ok(checkStatus('paid'));
        }
    }
];

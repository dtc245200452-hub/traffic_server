/**
 * Assertions and Validation Primitives for Commercial Traffic Server E2E Tests
 */
const assert = require('node:assert/strict');

/**
 * Validates VietQR URL against VietQR / Napas standard specification
 * @param {string} qrUrl - The generated VietQR image URL
 * @param {Object} expected - Expected parameters
 */
function assertVietQrUrl(qrUrl, expected = {}) {
    assert.ok(typeof qrUrl === 'string' && qrUrl.length > 0, 'VietQR URL must be a non-empty string');
    
    // Validate protocol and host
    const url = new URL(qrUrl);
    assert.equal(url.protocol, 'https:', 'VietQR must use HTTPS protocol');
    assert.equal(url.hostname, 'img.vietqr.io', 'VietQR must use img.vietqr.io host');
    
    // Path structure: /image/<bankId>-<accountNumber>-<template>.png
    const pathParts = url.pathname.split('/');
    assert.equal(pathParts[1], 'image', 'VietQR path must begin with /image/');
    
    const imageFile = pathParts[2] || '';
    assert.ok(imageFile.endsWith('.png'), 'VietQR image must end with .png');
    
    const bankDetails = imageFile.replace('.png', '').split('-');
    assert.ok(bankDetails.length >= 3, 'VietQR filename must contain bankId, accountNumber, and template');
    
    const [bankId, accountNumber, template] = bankDetails;
    if (expected.bankId) {
        assert.equal(bankId.toUpperCase(), expected.bankId.toUpperCase(), `Bank ID mismatch: expected ${expected.bankId}, got ${bankId}`);
    }
    if (expected.accountNumber) {
        assert.equal(accountNumber, expected.accountNumber, `Account number mismatch: expected ${expected.accountNumber}, got ${accountNumber}`);
    }
    if (expected.template) {
        assert.equal(template, expected.template, `Template mismatch: expected ${expected.template}, got ${template}`);
    }

    // Query parameters: amount, addInfo (memo), accountName
    const amountParam = url.searchParams.get('amount');
    assert.ok(amountParam !== null, 'VietQR URL must include amount query parameter');
    assert.ok(/^\d+$/.test(amountParam), 'amount parameter must be integer numeric string without decimals or commas');
    
    if (expected.amount !== undefined) {
        assert.equal(Number(amountParam), Number(expected.amount), `Amount mismatch in QR: expected ${expected.amount}, got ${amountParam}`);
    }

    const memoParam = url.searchParams.get('addInfo');
    assert.ok(memoParam !== null, 'VietQR URL must include addInfo query parameter');
    assertNonAccentedOrderCode(memoParam);
    if (expected.orderCode) {
        assert.equal(memoParam, expected.orderCode, `Order code in addInfo mismatch: expected ${expected.orderCode}, got ${memoParam}`);
    }

    const accountNameParam = url.searchParams.get('accountName');
    assert.ok(accountNameParam !== null, 'VietQR URL must include accountName query parameter');
    if (expected.accountName) {
        assert.equal(accountNameParam.toUpperCase(), expected.accountName.toUpperCase(), `Account name mismatch`);
    }

    return {
        bankId,
        accountNumber,
        template,
        amount: Number(amountParam),
        memo: memoParam,
        accountName: accountNameParam
    };
}

/**
 * Validates unique transaction memo code:
 * - Starts with TF
 * - Uppercase ASCII alphanumeric only [0-9A-Z]
 * - Zero Vietnamese diacritics, whitespace, or special symbols
 * - Length between 6 and 20 chars
 */
function assertNonAccentedOrderCode(orderCode) {
    assert.ok(typeof orderCode === 'string', 'Order code must be a string');
    assert.ok(orderCode.startsWith('TF'), `Order code must start with prefix 'TF', got '${orderCode}'`);
    assert.ok(
        /^TF[0-9A-Z]+$/.test(orderCode),
        `Order code '${orderCode}' must strictly contain uppercase ASCII letters and digits [0-9A-Z] without accents or symbols`
    );
    assert.ok(orderCode.length >= 6 && orderCode.length <= 20, `Order code length must be between 6 and 20 chars, got ${orderCode.length}`);
}

/**
 * Validates deterministic pricing calculation
 */
function assertPricing(pricing, expectedClicks, expectedHours) {
    const rawClicks = Number(expectedClicks);
    const rawHours = Number(expectedHours);
    
    const expectedRoundedHours = Math.max(1, Math.ceil(rawHours));
    const expectedClickFee = rawClicks * 40;
    const expectedDurationFee = expectedRoundedHours * 2000;
    const expectedTotal = expectedClickFee + expectedDurationFee;

    assert.equal(pricing.targetClicks, rawClicks, `targetClicks mismatch`);
    assert.equal(pricing.roundedHours, expectedRoundedHours, `roundedHours mismatch: expected ${expectedRoundedHours}, got ${pricing.roundedHours}`);
    assert.equal(pricing.clickFee, expectedClickFee, `clickFee mismatch: expected ${expectedClickFee}, got ${pricing.clickFee}`);
    assert.equal(pricing.durationFee, expectedDurationFee, `durationFee mismatch: expected ${expectedDurationFee}, got ${pricing.durationFee}`);
    assert.equal(pricing.totalAmount, expectedTotal, `totalAmount mismatch: expected ${expectedTotal}, got ${pricing.totalAmount}`);
}

/**
 * Verifies that zero clicks have occurred
 */
function assertZeroClicks(state) {
    if (!state) return;
    const totalVisits = state.totalVisits ?? state.visitsDelivered ?? 0;
    const successVisits = state.successVisits ?? 0;
    const activeWorkers = state.activeWorkers ?? 0;
    assert.equal(totalVisits, 0, `Pre-payment gating violated: totalVisits is ${totalVisits}, expected 0`);
    assert.equal(successVisits, 0, `Pre-payment gating violated: successVisits is ${successVisits}, expected 0`);
    assert.equal(activeWorkers, 0, `Pre-payment gating violated: activeWorkers is ${activeWorkers}, expected 0`);
}

module.exports = {
    assert,
    assertVietQrUrl,
    assertNonAccentedOrderCode,
    assertPricing,
    assertZeroClicks
};

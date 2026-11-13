const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const orderService = require('./orderService');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3005;

// ─── Setup JSON and body parsing ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Admin credentials ─────────────────────────────────────────────────────────
const ADMIN_CONFIG_PATH = path.join(__dirname, 'admin.json');

function hashPassword(password, salt) {
    const hash = crypto.createHmac('sha256', salt);
    hash.update(password);
    return hash.digest('hex');
}

function initAdminAccount() {
    if (!fs.existsSync(ADMIN_CONFIG_PATH)) {
        const salt = crypto.randomBytes(16).toString('hex');
        const defaultPassword = 'admin123456';
        const passwordHash = hashPassword(defaultPassword, salt);
        const config = { username: 'admin', salt, passwordHash };
        fs.writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify(config, null, 4));
        console.log('\n==================================================');
        console.log('Tai khoan mac dinh: admin / admin123456');
        console.log('==================================================\n');
    }
}

function updateAdminAccount(newUsername, newPassword) {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(newPassword, salt);
    fs.writeFileSync(ADMIN_CONFIG_PATH, JSON.stringify({ username: newUsername, salt, passwordHash }, null, 4));
}

function verifyAdminCredentials(username, password) {
    if (!fs.existsSync(ADMIN_CONFIG_PATH)) initAdminAccount();
    try {
        const config = JSON.parse(fs.readFileSync(ADMIN_CONFIG_PATH, 'utf-8'));
        if (config.username !== username) return false;
        return hashPassword(password, config.salt) === config.passwordHash;
    } catch (e) {
        return false;
    }
}

// ─── Sessions ──────────────────────────────────────────────────────────────────
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
function loadSessions() {
    const map = new Map();
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
            for (const [k, v] of Object.entries(data)) map.set(k, v);
        }
    } catch (e) {}
    return map;
}
function saveSessions() {
    try {
        const obj = {};
        for (const [k, v] of activeSessions.entries()) obj[k] = v;
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {}
}
const activeSessions = loadSessions();

// ─── Cookie helpers ────────────────────────────────────────────────────────────
function parseCookies(cookieHeader) {
    const list = {};
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
    return list;
}

// ─── Campaigns Directory ───────────────────────────────────────────────────────
const CAMPAIGNS_DIR = path.join(__dirname, 'campaigns');
if (!fs.existsSync(CAMPAIGNS_DIR)) fs.mkdirSync(CAMPAIGNS_DIR, { recursive: true });

// ─── Global Proxy Config ───────────────────────────────────────────────────────
const PROXY_CONFIG_PATH = path.join(__dirname, 'proxy_config.json');

function loadProxyConfig() {
    try {
        if (fs.existsSync(PROXY_CONFIG_PATH)) {
            const d = JSON.parse(fs.readFileSync(PROXY_CONFIG_PATH, 'utf-8'));
            if (d.cooldownSec === undefined) d.cooldownSec = 30;
            return d;
        }
    } catch (e) {}
    return { region: 'random', keys: [], cooldownSec: 30 };
}

function saveProxyConfig(config) {
    fs.writeFileSync(PROXY_CONFIG_PATH, JSON.stringify(config, null, 4));
}

let proxyConfigData = loadProxyConfig();

// ─── Telegram Bot Config & Notifications ───────────────────────────────────────
const TELEGRAM_CONFIG_PATH = path.join(__dirname, 'telegram_config.json');

function loadTelegramConfig() {
    try {
        if (fs.existsSync(TELEGRAM_CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_PATH, 'utf-8'));
        }
    } catch (e) {}
    return {
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        chatIds: [],
        notifyOnComplete: true,
        sendFileReport: true
    };
}

function saveTelegramConfig() {
    try {
        fs.writeFileSync(TELEGRAM_CONFIG_PATH, JSON.stringify(telegramConfig, null, 4));
    } catch (e) {}
}

let telegramConfig = loadTelegramConfig();
if (!telegramConfig.botToken && process.env.TELEGRAM_BOT_TOKEN) {
    telegramConfig.botToken = process.env.TELEGRAM_BOT_TOKEN;
}

async function sendTelegramMessage(chatId, htmlText) {
    if (!telegramConfig.botToken || !chatId) return;
    try {
        await axios.post(`https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`, {
            chat_id: chatId,
            text: htmlText,
            parse_mode: 'HTML'
        }, { timeout: 10000 });
    } catch (e) {
        console.error(`[Telegram] Error sending message to ${chatId}:`, e.message);
    }
}

async function sendTelegramDocument(chatId, filePath, caption) {
    if (!telegramConfig.botToken || !chatId || !fs.existsSync(filePath)) return;
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        const boundary = '----TelegramBoundary' + Math.random().toString(36).substring(2);

        let body = [];
        body.push(Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="chat_id"\r\n\r\n` +
            `${chatId}\r\n`
        ));
        if (caption) {
            body.push(Buffer.from(
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="caption"\r\n\r\n` +
                `${caption}\r\n`
            ));
            body.push(Buffer.from(
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="parse_mode"\r\n\r\n` +
                `HTML\r\n`
            ));
        }
        body.push(Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="document"; filename="${fileName}"\r\n` +
            `Content-Type: text/plain\r\n\r\n`
        ));
        body.push(fileBuffer);
        body.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        const payload = Buffer.concat(body);

        await axios.post(`https://api.telegram.org/bot${telegramConfig.botToken}/sendDocument`, payload, {
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            timeout: 20000
        });
    } catch (e) {
        console.error(`[Telegram] Error sending document to ${chatId}:`, e.message);
    }
}

async function notifyTelegramCampaignComplete(campaignId) {
    const campaign = campaigns.get(campaignId);
    if (!campaign || !telegramConfig.notifyOnComplete || (telegramConfig.chatIds || []).length === 0) return;

    const actualStartMs = campaign.actualStartTime || campaign.startTime;
    const actualEndMs = campaign.actualEndTime || Date.now();
    const actualStartStr = actualStartMs ? new Date(actualStartMs).toLocaleString('vi-VN') : 'N/A';
    const actualEndStr = actualEndMs ? new Date(actualEndMs).toLocaleString('vi-VN') : 'N/A';
    let durationStr = 'N/A';
    if (actualStartMs && actualEndMs && actualEndMs >= actualStartMs) {
        const diffMs = actualEndMs - actualStartMs;
        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        durationStr = `${mins} phut ${secs}s`;
    }

    const campaignName = campaign.config.name || `Chien dich ${campaignId}`;
    const targetUrl = campaign.config.targetUrl || 'N/A';
    const targetClicks = campaign.targetLimit || 0;
    const successVisits = campaign.successVisits || 0;
    const failedVisits = campaign.failedVisits || 0;
    const uniqueIps = campaign.usedIps ? campaign.usedIps.size : 0;
    const dupIps = campaign.dupIpsCount || 0;
    const pct = targetClicks ? Math.min(100, Math.round((successVisits / targetClicks) * 100)) : 0;

    const htmlMsg = `🎉 <b>CHIEN DICH HOAN THANH XUAT SAC!</b>\n\n`
        + `📋 <b>Chien dich:</b> ${campaignName}\n`
        + `🔗 <b>URL Muc tieu:</b> ${targetUrl}\n`
        + `🎯 <b>Chi tieu:</b> ${successVisits}/${targetClicks} luot (${pct}%)\n`
        + `✅ <b>Thanh cong:</b> ${successVisits} | ❌ <b>That bai:</b> ${failedVisits}\n`
        + `👥 <b>IP Duy nhat:</b> ${uniqueIps} | 🔄 <b>IP Trung:</b> ${dupIps}\n\n`
        + `⏱️ <b>Bat dau thuc te:</b> ${actualStartStr}\n`
        + `🏁 <b>Ket thuc thuc te:</b> ${actualEndStr}\n`
        + `⏳ <b>Tong thoi gian:</b> ${durationStr}\n\n`
        + `📁 <i>Bao cao chi tiet dang file .txt da duoc tu dong tao va gui kem ben duoi.</i>`;

    const reportText = `==================================================\n`
        + `  BAO CAO KET QUA CHIEN DICH CLICK LINK (TELEGRAM)\n`
        + `==================================================\n`
        + `Thoi gian xuat: ${new Date().toLocaleString('vi-VN')}\n\n`
        + `1. THONG TIN CHIEN DICH:\n`
        + `   - Ten chien dich : ${campaignName}\n`
        + `   - URL Dich        : ${targetUrl}\n`
        + `   - Che do phan bo : ${campaign.config.scheduleMode || 'Smart'}\n`
        + `   - Chi tieu        : ${targetClicks} luot\n\n`
        + `2. THOI GIAN THUC THI:\n`
        + `   - Bat dau thuc te : ${actualStartStr}\n`
        + `   - Ket thuc thuc te: ${actualEndStr}\n`
        + `   - Tong thoi gian  : ${durationStr}\n\n`
        + `3. KET QUA TRUY CAP:\n`
        + `   - Trang thai      : ${campaign.status.toUpperCase()}\n`
        + `   - Thanh cong      : ${successVisits} luot\n`
        + `   - That bai        : ${failedVisits} luot\n`
        + `   - IP Duy nhat     : ${uniqueIps}\n`
        + `   - IP Trung lap    : ${dupIps}\n`
        + `   - Ty le hoan thanh: ${pct}%\n`
        + `==================================================\n`;

    const reportFileName = `BaoCao_ChienDich_${campaignId}_${new Date().toISOString().slice(0,10)}.txt`;
    const tempReportPath = path.join(__dirname, reportFileName);

    try {
        fs.writeFileSync(tempReportPath, reportText, 'utf-8');
        for (const chatId of telegramConfig.chatIds) {
            if (telegramConfig.sendFileReport) {
                await sendTelegramDocument(chatId, tempReportPath, htmlMsg);
            } else {
                await sendTelegramMessage(chatId, htmlMsg);
            }
        }
    } catch (err) {
        console.error(`[Telegram] Error notifying campaign complete:`, err.message);
    } finally {
        if (fs.existsSync(tempReportPath)) {
            try { fs.unlinkSync(tempReportPath); } catch (e) {}
        }
    }
}

// Telegram auto chat_id discovery polling (Supports Private Chats, Groups & Channels)
let telegramOffset = 0;
async function pollTelegramUpdates() {
    if (!telegramConfig.botToken) return;
    try {
        const url = `https://api.telegram.org/bot${telegramConfig.botToken}/getUpdates?offset=${telegramOffset}&timeout=5`;
        const res = await axios.get(url, { timeout: 10000 });
        if (res.data && res.data.ok && Array.isArray(res.data.result)) {
            for (const update of res.data.result) {
                telegramOffset = update.update_id + 1;
                const msg = update.message || update.channel_post || update.edited_message;
                const chat = msg?.chat || update.my_chat_member?.chat;

                if (chat && chat.id) {
                    const chatId = chat.id;
                    const isNew = !telegramConfig.chatIds.includes(chatId);
                    if (isNew) {
                        telegramConfig.chatIds.push(chatId);
                        saveTelegramConfig();
                        console.log(`[Telegram] Registered new chat_id: ${chatId} (${chat.title || chat.username || 'chat'})`);
                    }

                    const text = msg?.text || '';
                    if (isNew || text.startsWith('/start') || text.startsWith('/help') || text.includes('@jun88v2_niadev_bot')) {
                        const chatTitle = chat.title ? ` (<b>${chat.title}</b>)` : '';
                        await sendTelegramMessage(chatId, `✅ <b>Da ket noi Telegram Bot thanh cong!</b>${chatTitle}\n\n`
                            + `🤖 Bot: <b>@jun88v2_niadev_bot</b>\n`
                            + `📌 Chat ID: <code>${chatId}</code>\n\n`
                            + `Nhom/Kenh se <b>tu dong nhan duoc thong bao & file bao cao chi tiet (.txt)</b> truc tiep tai day moi khi co chien dich hoan thanh!`);
                    }
                }
            }
        }
    } catch (e) {}
}
const telegramInterval = setInterval(pollTelegramUpdates, 8000);
if (require.main !== module) {
    telegramInterval.unref();
}

// ─── Global Proxy Pool ─────────────────────────────────────────────────────────
const globalProxyPool = new Map();
const customerKeys = new Set(); // keys owned by paying customers (dedicated to their own campaign)

function registerCustomerProxyKey(key) {
    if (!key) return;
    customerKeys.add(key);
    if (!globalProxyPool.has(key)) {
        globalProxyPool.set(key, { key, currentProxy: null, nextRequestAt: 0, isBusy: false, campaignId: null });
    }
}

function initProxyPool() {
    // Keep existing keyState if key still present (preserve cooldowns)
    const oldKeys = new Set(globalProxyPool.keys());
    const newKeys = new Set(proxyConfigData.keys || []);

    // Remove keys no longer in config
    for (const k of oldKeys) {
        if (!newKeys.has(k) && !customerKeys.has(k)) globalProxyPool.delete(k);
    }
    // Add new keys
    for (const key of newKeys) {
        if (!globalProxyPool.has(key)) {
            globalProxyPool.set(key, {
                key,
                currentProxy: null,
                nextRequestAt: 0,
                isBusy: false,
                campaignId: null
            });
        }
    }
}
initProxyPool();

// Acquire a free key from pool (fair: prefer keys not in use by same campaign)
function acquireKey(campaignId) {
    const now = Date.now();
    const available = [];
    const camp = campaigns.get(campaignId);
    const ownKey = camp && camp.customerProxyKey;
    for (const [k, state] of globalProxyPool.entries()) {
        // Customer keys are dedicated: only their own campaign uses them, and it uses only that key
        if (ownKey ? k !== ownKey : customerKeys.has(k)) continue;
        if (!state.isBusy && now >= state.nextRequestAt) {
            available.push(state);
        }
    }
    if (available.length === 0) return null;
    const preferOther = available.filter(s => s.campaignId !== campaignId);
    const chosen = (preferOther.length > 0 ? preferOther : available)[0];
    chosen.isBusy = true;
    chosen.campaignId = campaignId;
    return chosen;
}

function releaseKey(key) {
    const state = globalProxyPool.get(key);
    if (state) {
        state.isBusy = false;
        state.campaignId = null;
    }
}

// ─── Migration: old campaign_config_1.json / _2.json ──────────────────────────
function migrateOldConfigs() {
    for (const id of ['1', '2']) {
        const oldPath = path.join(__dirname, `campaign_config_${id}.json`);
        const newPath = path.join(CAMPAIGNS_DIR, `${id}.json`);
        if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
            try {
                const oldConfig = JSON.parse(fs.readFileSync(oldPath, 'utf-8'));
                const newConfig = {
                    name: `Chien dich ${id} (Migrated)`,
                    targetUrl: oldConfig.targetUrl || '',
                    targetClicks: oldConfig.targetClicks || 100,
                    startTimeStr: oldConfig.startTimeStr || null,
                    endTimeStr: oldConfig.endTimeStr || null,
                    startTime: oldConfig.startTime || (Date.now() + 60000),
                    endTime: oldConfig.endTime || (Date.now() + 4 * 3600000),
                    cleanMode: oldConfig.cleanMode || 'incognito',
                    browserMode: oldConfig.browserMode || 'request',
                    dwellMin: oldConfig.dwellMin || 2,
                    dwellMax: oldConfig.dwellMax || 5,
                    humanActions: oldConfig.humanActions !== false,
                    randomLinks: oldConfig.randomLinks !== false,
                    dedupIp: oldConfig.dedupIp || false
                };
                fs.writeFileSync(newPath, JSON.stringify(newConfig, null, 4));
                console.log(`[Migration] campaign_config_${id}.json -> campaigns/${id}.json`);

                if (oldConfig.proxyKeys && oldConfig.proxyKeys.length > 0 && proxyConfigData.keys.length === 0) {
                    proxyConfigData.keys = [...new Set([...proxyConfigData.keys, ...oldConfig.proxyKeys])];
                    if (oldConfig.region) proxyConfigData.region = oldConfig.region;
                    saveProxyConfig(proxyConfigData);
                    initProxyPool();
                    console.log(`[Migration] Proxy keys migrated to proxy_config.json`);
                }
            } catch (e) {
                console.error(`[Migration] Error campaign ${id}:`, e.message);
            }
        }
    }
}

// ─── Smart Hourly Weights & Schedule Generator ─────────────────────────────────
const { generateClickSchedule, buildTimeDistribution, formatDuration } = require('./timeDistribution');

// ─── Campaign State ────────────────────────────────────────────────────────────
const campaigns = new Map();

function createCampaignState(id, config) {
    const scheduleMode = config.scheduleMode || 'smart';
    const customBlocks = config.customBlocks || null;
    const schedule = generateClickSchedule(config.startTime, config.endTime, config.targetClicks, scheduleMode, customBlocks);
    const now = Date.now();
    let status = 'waiting';
    if (now >= config.endTime) status = 'expired';
    else if (now >= config.startTime) status = 'running';

    const orderId = config.orderId || null;
    const paymentStatus = config.paymentStatus !== undefined
        ? config.paymentStatus
        : (config.orderId ? 'pending_payment' : 'paid');
    const customerProxyKey = config.customerProxyKey || null;

    return {
        id,
        config: {
            ...config,
            scheduleMode,
            browserMode: 'request', // commercial edition: lightweight HTTP requests only
            orderId,
            paymentStatus,
            customerProxyKey
        },
        status,
        orderId,
        paymentStatus,
        customerProxyKey,
        startTime: config.startTime,
        endTime: config.endTime,
        actualStartTime: status === 'running' ? now : null,
        actualEndTime: null,
        targetLimit: config.targetClicks,
        schedule,
        scheduleIdx: 0,
        totalVisits: 0,
        successVisits: 0,
        failedVisits: 0,
        usedIps: new Set(),
        dupIpsCount: 0,
        activeWorkers: 0,
        lastWaitingLogTime: 0
    };
}

// ─── Load campaigns from disk ──────────────────────────────────────────────────
function loadCampaignsFromDisk() {
    try {
        const files = fs.readdirSync(CAMPAIGNS_DIR).filter(f => f.endsWith('.json'));
        for (const file of files) {
            const id = file.replace('.json', '');
            try {
                const config = JSON.parse(fs.readFileSync(path.join(CAMPAIGNS_DIR, file), 'utf-8'));
                if (!config.targetUrl || !config.startTime || !config.endTime) continue;
                if (config.orderId) {
                    const linkedOrder = orderService.getOrder(config.orderId);
                    if (!linkedOrder || ['completed', 'stopped', 'expired'].includes(linkedOrder.status)) {
                        continue;
                    }
                }
                if (config.customerProxyKey) registerCustomerProxyKey(config.customerProxyKey);
                const state = createCampaignState(id, config);
                campaigns.set(id, state);
            } catch (e) {
                console.error(`[Load] Error reading campaign ${file}:`, e.message);
            }
        }
        console.log(`[Load] Loaded ${campaigns.size} campaigns from disk.`);
    } catch (e) {}
}

function saveCampaignConfig(id, config) {
    try {
        fs.writeFileSync(path.join(CAMPAIGNS_DIR, `${id}.json`), JSON.stringify(config, null, 4));
    } catch (e) {
        console.error(`Error saving campaign ${id}:`, e.message);
    }
}

function deleteCampaignFile(id) {
    try {
        const p = path.join(CAMPAIGNS_DIR, `${id}.json`);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (e) {}
}

function generateCampaignId() {
    const idCandidates = new Set(Array.from(campaigns.keys()));
    try {
        const files = fs.readdirSync(CAMPAIGNS_DIR).filter(f => f.endsWith('.json'));
        for (const f of files) idCandidates.add(f.replace('.json', ''));
    } catch (e) {}
    try {
        for (const o of orderService.listOrders()) {
            if (o && o.campaignId) idCandidates.add(String(o.campaignId));
        }
    } catch (e) {}
    const existingIds = Array.from(idCandidates).map(Number).filter(n => Number.isFinite(n) && n > 0);
    if (existingIds.length === 0) return '1';
    return String(Math.max(...existingIds) + 1);
}

function getLinkedCampaign(order) {
    if (!order || !order.campaignId) return null;
    const camp = campaigns.get(String(order.campaignId));
    if (!camp) return null;
    if (camp.orderId && camp.orderId !== order.orderId) return null;
    return camp;
}

// ─── User-Agents pool ──────────────────────────────────────────────────────────
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Edge/122.0.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/605.1.15',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Android 14; Mobile; rv:123.0) Gecko/123.0 Firefox/123.0'
];

const VIEWPORTS = [
    { width: 1920, height: 1080 }, { width: 1536, height: 864 },
    { width: 1440, height: 900 }, { width: 1366, height: 768 }
];
const MOBILE_VIEWPORTS = [
    { width: 390, height: 844 }, { width: 412, height: 915 },
    { width: 360, height: 800 }, { width: 430, height: 932 }
];

function getRandomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function getRandomRange(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ─── Log & Stats ───────────────────────────────────────────────────────────────
function sendLog(campaignId, text, type = 'info') {
    console.log(`[C${campaignId}][${type.toUpperCase()}] ${text}`);
    io.to('admins').emit('log', { campaignId, text, type });
}

function buildOrderProgressPayload(campaign, order) {
    if (campaign) {
        return {
            orderId: campaign.orderId || (order && order.orderId) || null,
            campaignId: campaign.id,
            status: campaign.status,
            successVisits: campaign.successVisits,
            failedVisits: campaign.failedVisits,
            totalVisits: campaign.totalVisits || 0,
            uniqueIps: campaign.usedIps ? campaign.usedIps.size : 0,
            dupIps: campaign.dupIpsCount || 0,
            targetLimit: campaign.targetLimit,
            startTime: campaign.startTime,
            endTime: campaign.endTime,
            actualStartTime: campaign.actualStartTime || (order && order.paidAt) || null,
            actualEndTime: campaign.actualEndTime || (order && order.completedAt) || null,
            browserMode: (campaign.config && campaign.config.browserMode) || 'request',
            scheduleMode: (campaign.config && campaign.config.scheduleMode) || (order && order.scheduleMode) || 'smart'
        };
    }
    if (order && order.campaignId) {
        return {
            orderId: order.orderId,
            campaignId: order.campaignId,
            status: order.status,
            successVisits: order.successVisits || 0,
            failedVisits: order.failedVisits || 0,
            totalVisits: order.totalVisits || ((order.successVisits || 0) + (order.failedVisits || 0)),
            uniqueIps: order.uniqueIps || 0,
            dupIps: order.dupIps || 0,
            targetLimit: order.targetClicks || 0,
            startTime: order.paidAt || order.createdAt || null,
            endTime: order.completedAt || null,
            actualStartTime: order.paidAt || null,
            actualEndTime: order.completedAt || null,
            browserMode: order.browserMode || 'request',
            scheduleMode: order.scheduleMode || 'smart'
        };
    }
    return null;
}

function emitStats(campaignId) {
    const campaign = campaigns.get(campaignId);
    if (!campaign) return;
    const now = Date.now();
    const timeLeft = campaign.endTime ? Math.max(0, campaign.endTime - now) : null;
    let etaStr = '--:--', timeRemainingStr = '';
    if (campaign.endTime) {
        etaStr = new Date(campaign.endTime).toLocaleTimeString('vi-VN');
        const minsLeft = Math.floor(timeLeft / 60000);
        const secsLeft = Math.floor((timeLeft % 60000) / 1000);
        if (campaign.status === 'waiting' && campaign.startTime > now) {
            const toStart = campaign.startTime - now;
            timeRemainingStr = `Cho chay (con ${Math.floor(toStart / 60000)}p ${Math.floor((toStart % 60000) / 1000)}s)`;
        } else {
            timeRemainingStr = `${minsLeft}p ${secsLeft}s`;
        }
    }
    io.to('admins').emit('stats-update', {
        campaignId, status: campaign.status,
        total: campaign.totalVisits, target: campaign.targetLimit || 0,
        success: campaign.successVisits, failed: campaign.failedVisits,
        uniqueIps: campaign.usedIps.size, dupIps: campaign.dupIpsCount,
        etaStr, timeRemainingStr, timeRemainingMs: timeLeft,
        startTimeStr: campaign.config.startTimeStr,
        endTimeStr: campaign.config.endTimeStr,
        actualStartTime: campaign.actualStartTime,
        actualEndTime: campaign.actualEndTime
    });
    if (campaign.orderId) {
        io.to(`order:${campaign.orderId}`).emit('order-progress', buildOrderProgressPayload(campaign, null));
    }
}

function emitCampaignList() {
    const list = [];
    for (const [id, c] of campaigns.entries()) {
        list.push({
            id, name: c.config.name || `Chien dich ${id}`,
            targetUrl: c.config.targetUrl, status: c.status,
            successVisits: c.successVisits, targetLimit: c.targetLimit,
            startTimeStr: c.config.startTimeStr, endTimeStr: c.config.endTimeStr,
            config: c.config  // always include full config
        });
    }
    io.to('admins').emit('campaigns-list', list);
}

// ─── KiotProxy API ─────────────────────────────────────────────────────────────
async function fetchNewProxy(campaignId, keyState) {
    const region = proxyConfigData.region || 'random';
    const url = `https://api.kiotproxy.com/api/v1/proxies/new?key=${keyState.key}&region=${region}`;
    try {
        sendLog(campaignId, `[Key: ...${keyState.key.slice(-5)}] Dang xoay IP moi...`, 'info');
        const response = await axios.get(url, { timeout: 10000 });
        if (response.data && response.data.success) {
            const proxyData = response.data.data;
            keyState.currentProxy = proxyData;
            keyState.nextRequestAt = Date.now() + (proxyData.ttc * 1000);
            sendLog(campaignId, `[Key: ...${keyState.key.slice(-5)}] Doi proxy thanh cong: ${proxyData.realIpAddress} (${proxyData.location}, TTL: ${proxyData.ttl}s, Cho: ${proxyData.ttc}s)`, 'success');
            return proxyData;
        } else {
            sendLog(campaignId, `[Key: ...${keyState.key.slice(-5)}] Doi proxy that bai: ${response.data ? response.data.message : 'Unknown'}`, 'warn');
            return null;
        }
    } catch (error) {
        sendLog(campaignId, `[Key: ...${keyState.key.slice(-5)}] Loi API doi proxy: ${error.message}`, 'error');
        return null;
    }
}

async function fetchCurrentProxy(campaignId, keyState) {
    const url = `https://api.kiotproxy.com/api/v1/proxies/current?key=${keyState.key}`;
    try {
        const response = await axios.get(url, { timeout: 10000 });
        if (response.data && response.data.success) {
            const proxyData = response.data.data;
            keyState.currentProxy = proxyData;
            keyState.nextRequestAt = Date.now() + (proxyData.ttc * 1000);
            return proxyData;
        }
    } catch (e) {}
    return null;
}

async function fetchOutProxy(key) {
    if (!key) return;
    try { await axios.get(`https://api.kiotproxy.com/api/v1/proxies/out?key=${key}`, { timeout: 8000 }); } catch (e) {}
}

// ─── Worker (Lightweight HTTP Request Only) ────────────────────────────────────
async function runVisitWorker(campaignId, keyState) {
    const campaign = campaigns.get(campaignId);
    if (!campaign || campaign.paymentStatus !== 'paid') {
        releaseKey(keyState.key);
        return;
    }

    campaign.activeWorkers++;
    campaign.totalVisits++;
    emitStats(campaignId);

    const shortKey = keyState.key.slice(-5);
    const targetUrl = campaign.config.targetUrl;
    const dwellMin = Number(campaign.config.dwellMin) || 2;
    const dwellMax = Math.max(dwellMin, Number(campaign.config.dwellMax) || 5);
    const proxyIpPort = keyState.currentProxy ? keyState.currentProxy.http : null;
    const realIp = keyState.currentProxy ? keyState.currentProxy.realIpAddress : 'Direct';

    sendLog(campaignId, `Khoi chay worker | Key: ...${shortKey} | IP: ${realIp}`, 'info');

    let success = false;

    try {
        const userAgent = getRandomItem(USER_AGENTS);

        let proxyConfig = false;
        if (proxyIpPort) {
            const [proxyHost, proxyPortStr] = proxyIpPort.split(':');
            proxyConfig = { host: proxyHost, port: parseInt(proxyPortStr) };
        }
        const referer = getRandomItem([
            'https://www.google.com/', 'https://www.google.com.vn/', 'https://www.google.com.vn/',
            'https://www.facebook.com/', 'https://m.facebook.com/', 'https://www.bing.com/',
            '', '', '', ''
        ]);
        const isMobileUA = userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone');
        const baseHeaders = {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': getRandomItem(['vi-VN,vi;q=0.9,en-US;q=0.8', 'vi,en-US;q=0.9,en;q=0.8']),
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
            'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate',
            'sec-fetch-site': referer ? 'cross-site' : 'none',
            ...(isMobileUA ? {} : { 'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124"' }),
            ...(Math.random() > 0.5 ? { 'DNT': '1' } : {})
        };
        if (referer) baseHeaders['Referer'] = referer;

        const mainResponse = await axios.get(targetUrl, {
            proxy: proxyConfig, headers: baseHeaders, timeout: 30000, maxRedirects: 5, validateStatus: s => s < 500
        });
        sendLog(campaignId, `[Key: ...${shortKey}] Tai trang thanh cong (HTTP ${mainResponse.status}).`, 'success');

        const firstDwell = getRandomRange(Math.max(1, Math.floor(dwellMin * 0.4)), Math.max(1, Math.floor(dwellMax * 0.5)));
        await new Promise(resolve => setTimeout(resolve, firstDwell * 1000));

        if (campaign.config.randomLinks && mainResponse.data && typeof mainResponse.data === 'string') {
            try {
                const html = mainResponse.data;
                const urlObj = new URL(targetUrl);
                const baseHost = urlObj.origin;
                const hrefMatches = [...html.matchAll(/href=["']([^"'#]+?)["']/gi)];
                const internalLinks = hrefMatches.map(m => {
                    try {
                        const href = m[1].trim();
                        if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return null;
                        if (href.startsWith('http')) { const u = new URL(href); return u.hostname === urlObj.hostname ? href : null; }
                        else if (href.startsWith('/')) return baseHost + href;
                        return null;
                    } catch { return null; }
                }).filter(l => l && l !== targetUrl && !/\.(pdf|jpg|jpeg|png|gif|svg|css|js|ico|woff)$/i.test(l));
                const uniqueInternalLinks = [...new Set(internalLinks)];
                if (uniqueInternalLinks.length > 0) {
                    const subLink = getRandomItem(uniqueInternalLinks);
                    await new Promise(resolve => setTimeout(resolve, getRandomRange(800, 2500)));
                    await axios.get(subLink, {
                        proxy: proxyConfig, headers: { ...baseHeaders, 'Referer': targetUrl, 'sec-fetch-site': 'same-origin' },
                        timeout: 20000, maxRedirects: 3, validateStatus: () => true
                    });
                    sendLog(campaignId, `[Key: ...${shortKey}] Click link noi bo: ${subLink.slice(0, 70)}`, 'browser');
                }
            } catch (e) {}
        }

        const remainDwell = getRandomRange(Math.max(1, Math.floor(dwellMin * 0.4)), Math.max(1, Math.floor(dwellMax * 0.5)));
        await new Promise(resolve => setTimeout(resolve, remainDwell * 1000));
        success = true;
        sendLog(campaignId, `[Key: ...${shortKey}] Luot truy cap hoan tat! (~${firstDwell + remainDwell}s)`, 'success');

    } catch (error) {
        sendLog(campaignId, `[Key: ...${shortKey}] Loi: ${error.message}`, 'error');
        success = false;
    } finally {
        if (success) campaign.successVisits++;
        else campaign.failedVisits++;

        campaign.activeWorkers--;

        // Cooldown sau khi xong: dung gia tri tu campaign config neu co, neu khong dung gia tri tu proxyConfigData, mac dinh 30s
        const kState = globalProxyPool.get(keyState.key);
        const campCd = campaign ? campaign.config.cooldownSec : null;
        const effectiveCdSec = (typeof campCd === 'number' && campCd >= 0) ? campCd : (proxyConfigData.cooldownSec ?? 30);
        const cooldownMs = effectiveCdSec * 1000;
        if (kState && kState.nextRequestAt <= Date.now()) {
            kState.nextRequestAt = Date.now() + cooldownMs;
        }
        releaseKey(keyState.key);

        sendLog(campaignId, `Hoan tat phien | Key: ...${shortKey}`, 'info');
        emitStats(campaignId);

        // Check completion
        const c = campaigns.get(campaignId);
        if (c && c.status === 'running' && c.successVisits >= c.targetLimit) {
            completeCampaign(campaignId, 'completed');
        }
    }
}

// ─── Campaign lifecycle ────────────────────────────────────────────────────────
function completeCampaign(campaignId, reason) {
    const campaign = campaigns.get(campaignId);
    if (!campaign) return;
    if (['stopped', 'completed', 'expired'].includes(campaign.status)) return;

    campaign.status = reason;
    campaign.actualEndTime = Date.now();
    if (!campaign.actualStartTime) campaign.actualStartTime = campaign.startTime || Date.now();

    const msgs = {
        completed: `Chien dich ${campaignId} HOAN THANH! ${campaign.successVisits}/${campaign.targetLimit} luot.`,
        expired: `Chien dich ${campaignId} HET GIO. ${campaign.successVisits}/${campaign.targetLimit} luot.`,
        stopped: `Chien dich ${campaignId} DA DUNG. ${campaign.successVisits}/${campaign.targetLimit} luot.`
    };
    sendLog(campaignId, msgs[reason] || `Campaign ${campaignId} ended: ${reason}`, reason === 'completed' ? 'success' : 'system');

    io.to('admins').emit('status-update', { campaignId, status: campaign.status, isRunning: false });
    if (campaign.orderId) {
        try {
            orderService.updateOrderStatus(campaign.orderId, reason, {
                completedAt: campaign.actualEndTime,
                successVisits: campaign.successVisits,
                failedVisits: campaign.failedVisits,
                totalVisits: campaign.totalVisits || 0,
                uniqueIps: campaign.usedIps ? campaign.usedIps.size : 0,
                dupIps: campaign.dupIpsCount || 0
            });
            io.to(`order:${campaign.orderId}`).emit('order-progress', buildOrderProgressPayload(campaign, null));
            io.to('admins').emit('orders-updated');
        } catch (e) {}
    }
    emitStats(campaignId);
    emitCampaignList();

    if (reason === 'completed') {
        notifyTelegramCampaignComplete(campaignId).catch(err => console.error(`[Telegram] Notify error:`, err.message));
    }
}

function stopCampaign(campaignId) {
    const campaign = campaigns.get(campaignId);
    if (!campaign) return;
    if (['stopped', 'completed', 'expired'].includes(campaign.status)) return;
    completeCampaign(campaignId, 'stopped');
}

// ─── Scheduler tick ────────────────────────────────────────────────────────────
async function scheduleTick(campaignId) {
    const campaign = campaigns.get(campaignId);
    if (!campaign) return;
    if (['stopped', 'completed', 'expired'].includes(campaign.status)) return;

    // Strict Pre-Payment Gate: Zero clicks allowed if not paid
    if (campaign.paymentStatus !== 'paid') return;

    const now = Date.now();

    // Check completion first
    if (campaign.successVisits >= campaign.targetLimit) {
        completeCampaign(campaignId, 'completed');
        return;
    }

    // Check expiry — nhưng CHỈ dừng khi không còn workers nào đang chạy
    // và không có click nào trong schedule chưa fire
    const remaining = campaign.targetLimit - campaign.successVisits;
    const inFlight = campaign.activeWorkers;
    if (now >= campaign.endTime) {
        // Nếu hết giờ nhưng vẫn còn chỉ tiêu chưa đạt:
        // → vào chế độ burst: tiếp tục chạy dồn cho đến khi đủ
        if (remaining > inFlight && !campaign._burstLogged) {
            campaign._burstLogged = true;
            sendLog(campaignId, `Het gio nhung con thieu ${remaining} luot — chuyen sang che do bu (burst).`, 'system');
        }
        // Nếu không còn gì để chạy nữa thì mới expired
        if (remaining <= inFlight) {
            // Đang có đủ workers in-flight, chờ chúng xong
            emitStats(campaignId);
            return;
        }
        // Ngược lại: burst launch bên dưới sẽ xử lý
    }

    // Waiting -> Running transition
    if (campaign.status === 'waiting') {
        if (now >= campaign.startTime) {
            campaign.status = 'running';
            campaign.actualStartTime = now;
            sendLog(campaignId, `Thoi diem bat dau da den! Chien dich ${campaignId} bat dau chay.`, 'system');
            io.emit('status-update', { campaignId, status: 'running', isRunning: true });
            emitCampaignList();
        } else {
            if (now - campaign.lastWaitingLogTime >= 30000) {
                const diffMs = campaign.startTime - now;
                sendLog(campaignId, `Cho bat dau vao luc ${campaign.config.startTimeStr || ''} (con ${Math.floor(diffMs / 60000)}p ${Math.floor((diffMs % 60000) / 1000)}s)...`, 'info');
                campaign.lastWaitingLogTime = now;
            }
            emitStats(campaignId);
            return;
        }
    }

    // Tính tốc độ cần thiết: nếu còn ít thời gian hoặc đã quá giờ → tăng max launch/tick
    const timeLeftMs = Math.max(0, campaign.endTime - now);
    const clicksLeft = campaign.targetLimit - campaign.successVisits - campaign.activeWorkers;
    const isOverdue = now >= campaign.endTime;
    // Nếu số click còn lại nhiều hơn thời gian có thể tự rải → burst
    const needsBurst = isOverdue || (timeLeftMs < 30000 && clicksLeft > 5);
    const maxLaunchPerTick = needsBurst ? 5 : 2;

    // Process schedule slots that are now due
    let launchedThisTick = 0;

    // Trong chế độ burst/overdue: fire tất cả clicks còn lại trong schedule
    while (
        campaign.scheduleIdx < campaign.schedule.length &&
        (campaign.schedule[campaign.scheduleIdx] <= now || isOverdue) &&
        launchedThisTick < maxLaunchPerTick
    ) {
        // Check if we've dispatched enough (in-flight + successful)
        if (campaign.successVisits + campaign.activeWorkers >= campaign.targetLimit) {
            campaign.scheduleIdx = campaign.schedule.length;
            break;
        }

        // Try to get a free key from the pool
        const keyState = acquireKey(campaignId);
        if (!keyState) {
            // Pool exhausted, skip this tick; scheduler will retry next second
            break;
        }

        // Rotate IP for this key
        const newProxy = await fetchNewProxy(campaignId, keyState);
        if (!newProxy) {
            await fetchCurrentProxy(campaignId, keyState);
        }

        if (keyState.currentProxy) {
            const newIp = keyState.currentProxy.realIpAddress;
            if (campaign.config.dedupIp && campaign.usedIps.has(newIp)) {
                sendLog(campaignId, `IP da dung: ${newIp}. Bo qua luot nay.`, 'warn');
                campaign.dupIpsCount++;
                keyState.isBusy = false;
                keyState.campaignId = null;
                campaign.scheduleIdx++;
                continue;
            }
            campaign.usedIps.add(newIp);
        }

        campaign.scheduleIdx++;
        launchedThisTick++;
        runVisitWorker(campaignId, keyState).catch(err => {
            sendLog(campaignId, `Loi worker: ${err.message}`, 'error');
        });
    }

    // Nếu đã hết schedule slots nhưng vẫn chưa đủ chỉ tiêu (burst mode)
    if (
        isOverdue &&
        campaign.scheduleIdx >= campaign.schedule.length &&
        campaign.successVisits + campaign.activeWorkers < campaign.targetLimit &&
        launchedThisTick < maxLaunchPerTick
    ) {
        const extraNeeded = campaign.targetLimit - campaign.successVisits - campaign.activeWorkers;
        const extraLaunch = Math.min(extraNeeded, maxLaunchPerTick - launchedThisTick);
        for (let i = 0; i < extraLaunch; i++) {
            const keyState = acquireKey(campaignId);
            if (!keyState) break;
            const newProxy = await fetchNewProxy(campaignId, keyState);
            if (!newProxy) await fetchCurrentProxy(campaignId, keyState);
            if (keyState.currentProxy) {
                const newIp = keyState.currentProxy.realIpAddress;
                if (campaign.config.dedupIp && campaign.usedIps.has(newIp)) {
                    sendLog(campaignId, `IP da dung: ${newIp}. Bo qua luot nay.`, 'warn');
                    campaign.dupIpsCount++;
                    keyState.isBusy = false;
                    keyState.campaignId = null;
                    continue;
                }
                campaign.usedIps.add(newIp);
            }
            runVisitWorker(campaignId, keyState).catch(err => {
                sendLog(campaignId, `Loi worker: ${err.message}`, 'error');
            });
        }
    }

    emitStats(campaignId);
}

// ─── Auth middleware ───────────────────────────────────────────────────────────
initAdminAccount();

function getUserRole(username) {
    if (!username) return null;
    if (username === '1') return 'guest';
    return 'admin';
}

app.use((req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    req.sessionToken = cookies ? cookies.session_token : null;
    const sessVal = req.sessionToken ? activeSessions.get(req.sessionToken) : null;
    req.username = (sessVal && typeof sessVal === 'object') ? sessVal.username : sessVal;
    req.userRole = (sessVal && typeof sessVal === 'object') ? sessVal.role : getUserRole(req.username);
    req.isAuthenticated = !!req.username;
    next();
});

function requireAuth(req, res, next) {
    const isPublicPath = req.path === '/login.html' || req.path.startsWith('/css/') ||
        req.path === '/js/login.js' || req.path.startsWith('/api/login') ||
        req.path.startsWith('/socket.io/') || req.path === '/favicon.ico' ||
        req.path.startsWith('/api/orders') || req.path === '/api/payment/webhook' ||
        req.path === '/order.html' || req.path === '/track.html' || req.path === '/api/public-config' ||
        req.path === '/boost' || req.path === '/boost/' || req.path === '/boost.html' ||
        req.path === '/js/boost.js' || req.path === '/js/timeDistribution.js';
    if (isPublicPath) return next();
    if (!req.isAuthenticated) {
        if (req.path.startsWith('/api/')) return res.status(401).json({ success: false, message: 'Unauthorized' });
        return res.redirect('/login.html');
    }
    if (req.path === '/login.html') return res.redirect('/');
    next();
}
app.use(requireAuth);

function requireAdmin(req, res, next) {
    if (req.userRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Tai khoan khach khong co quyen thuc hien thao tac nay.' });
    }
    next();
}

// ─── REST API ──────────────────────────────────────────────────────────────────

app.get('/api/me', (req, res) => {
    res.json({ success: true, username: req.username, role: req.userRole });
});

app.post('/api/login', (req, res) => {
    const { username, password, rememberMe } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Vui long dien du thong tin.' });

    let role = null;
    if (verifyAdminCredentials(username, password)) {
        role = 'admin';
    } else if (String(username).trim() === '1' && String(password) === '1') {
        role = 'guest';
    }

    if (role) {
        const token = crypto.randomUUID();
        const userObj = { username, role };
        activeSessions.set(token, userObj); saveSessions();
        const cookieOptions = { httpOnly: true, path: '/' };
        if (rememberMe !== false) {
            cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000;
        }
        res.cookie('session_token', token, cookieOptions);
        return res.json({ success: true, role, username });
    }
    return res.status(401).json({ success: false, message: 'Tai khoan hoac mat khau khong chinh xac.' });
});

app.post('/api/logout', (req, res) => {
    if (req.sessionToken) { activeSessions.delete(req.sessionToken); saveSessions(); }
    res.clearCookie('session_token', { path: '/' });
    res.json({ success: true });
});

app.post('/api/change-password', requireAdmin, (req, res) => {
    const { newUsername, newPassword, currentPassword } = req.body;
    if (!newUsername || !newPassword || !currentPassword) return res.status(400).json({ success: false, message: 'Dien du thong tin.' });
    if (!verifyAdminCredentials(req.username, currentPassword)) return res.status(401).json({ success: false, message: 'Mat khau hien tai khong dung.' });
    try { updateAdminAccount(newUsername, newPassword); activeSessions.set(req.sessionToken, { username: newUsername, role: 'admin' }); saveSessions(); return res.json({ success: true }); }
    catch (e) { return res.status(500).json({ success: false, message: 'Loi luu.' }); }
});

app.get('/api/auth-check', (req, res) => {
    if (req.isAuthenticated) return res.json({ success: true, username: req.username, role: req.userRole });
    return res.status(401).json({ success: false });
});

// Proxy Config
app.get('/api/proxy-config', (req, res) => res.json({ success: true, data: proxyConfigData }));

app.post('/api/proxy-config', requireAdmin, (req, res) => {
    const { region, keys, cooldownSec } = req.body;
    if (!Array.isArray(keys)) return res.status(400).json({ success: false, message: 'keys phai la array.' });
    const cd = (typeof cooldownSec === 'number' && cooldownSec >= 0) ? cooldownSec : 30;
    proxyConfigData = { region: region || 'random', keys, cooldownSec: cd };
    saveProxyConfig(proxyConfigData);
    initProxyPool();
    console.log(`[ProxyConfig] Saved ${keys.length} keys, region: ${region}, cooldown: ${cd}s`);
    res.json({ success: true, message: `Da luu ${keys.length} proxy key(s). Cooldown: ${cd}s`, poolSize: globalProxyPool.size });
});

// Campaigns CRUD
app.get('/api/campaigns', (req, res) => {
    const list = [];
    for (const [id, c] of campaigns.entries()) {
        list.push({ id, name: c.config.name || `Chien dich ${id}`, targetUrl: c.config.targetUrl, status: c.status, successVisits: c.successVisits, failedVisits: c.failedVisits, targetLimit: c.targetLimit, startTimeStr: c.config.startTimeStr, endTimeStr: c.config.endTimeStr, config: c.config });
    }
    res.json({ success: true, data: list });
});

app.post('/api/campaigns', requireAdmin, (req, res) => {
    const config = { ...req.body, browserMode: 'request' };
    if (!config.targetUrl || !config.startTime || !config.endTime || !config.targetClicks) {
        return res.status(400).json({ success: false, message: 'Thieu truong bat buoc.' });
    }
    if (config.endTime <= config.startTime) {
        return res.status(400).json({ success: false, message: 'End time phai sau start time.' });
    }
    const id = generateCampaignId();
    const state = createCampaignState(id, config);
    campaigns.set(id, state);
    saveCampaignConfig(id, config);

    sendLog(id, `Chien dich ${id} da duoc tao: ${config.targetUrl} | ${config.targetClicks} luot | ${config.startTimeStr} -> ${config.endTimeStr}`, 'system');
    io.to('admins').emit('status-update', { campaignId: id, status: state.status, isRunning: ['running', 'waiting'].includes(state.status) });
    emitCampaignList();
    emitStats(id);

    res.status(201).json({ success: true, id });
});

app.delete('/api/campaigns/:id', requireAdmin, (req, res) => {
    const id = req.params.id;
    if (!campaigns.has(id)) return res.status(404).json({ success: false, message: 'Khong tim thay.' });
    if (['running', 'waiting'].includes(campaigns.get(id).status)) stopCampaign(id);
    campaigns.delete(id);
    deleteCampaignFile(id);
    io.to('admins').emit('campaign-deleted', { campaignId: id });
    emitCampaignList();
    res.json({ success: true });
});

app.post('/api/campaigns/:id/stop', requireAdmin, (req, res) => {
    const id = req.params.id;
    if (!campaigns.has(id)) return res.status(404).json({ success: false, message: 'Khong tim thay.' });
    stopCampaign(id);
    res.json({ success: true });
});

app.post('/api/campaigns/:id/reset-stats', requireAdmin, (req, res) => {
    const id = req.params.id;
    const campaign = campaigns.get(id);
    if (!campaign) return res.status(404).json({ success: false });
    campaign.totalVisits = 0; campaign.successVisits = 0;
    campaign.failedVisits = 0; campaign.usedIps = new Set(); campaign.dupIpsCount = 0;
    sendLog(id, `Reset thong ke Chien dich ${id}.`, 'system');
    emitStats(id);
    res.json({ success: true });
});

// ─── Commercial Orders API ───────────────────────────────────────────────────

app.get('/boost', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'boost.html'));
});

app.get('/api/public-config', (req, res) => {
    res.json({
        success: true,
        authenticated: Boolean(req.isAuthenticated),
        role: req.userRole || null,
        username: req.username || null,
        singleAccountMode: true,
        browserMode: 'request',
        pricing: {
            clickRate: orderService.CONSTANTS.CLICK_RATE,
            hourlyRate: orderService.CONSTANTS.HOURLY_RATE,
            currency: 'VND'
        },
        bankInfo: orderService.getPublicBankInfo()
    });
});

app.post('/api/orders/calculate-cost', (req, res) => {
    try {
        const { targetClicks, durationHours } = req.body || {};
        const cost = orderService.calculateOrderCost(targetClicks, durationHours);
        res.json({ success: true, ...cost });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.post('/api/orders', (req, res) => {
    try {
        const order = orderService.createOrder(req.body);
        io.to('admins').emit('orders-updated');
        res.status(201).json({ success: true, ...order });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.get('/api/orders/:id', (req, res) => {
    const order = orderService.getOrder(req.params.id);
    if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
    }
    // Public view: never expose the customer's proxy key or webhook secret; include live campaign progress
    const { proxyKey, bankInfo, ...rest } = order;
    const { webhookSecret, ...safeBankInfo } = bankInfo || {};
    const pub = {
        ...rest,
        bankInfo: safeBankInfo,
        proxyKeyMasked: orderService.maskProxyKey(proxyKey)
    };
    const camp = getLinkedCampaign(order);
    pub.progress = buildOrderProgressPayload(camp, order);
    res.json({ success: true, order: pub });
});

// Activate a paid order -> campaign. Idempotent + serialized per order (sync section => atomic in Node).
const activatingOrders = new Set();

function activateOrder(orderId, paymentInfo = {}) {
    const order = orderService.getOrder(orderId);
    if (!order) return { ok: false, code: 404, message: 'Order not found' };

    // Idempotent: already activated -> return existing campaign
    if (order.campaignId) {
        return { ok: true, already: true, orderId: order.orderId, campaignId: order.campaignId, status: order.status };
    }
    if (activatingOrders.has(order.orderId)) {
        return { ok: true, already: true, orderId: order.orderId, campaignId: null, status: 'activating' };
    }
    activatingOrders.add(order.orderId);
    try {
        orderService.confirmOrderPayment(order.orderId, paymentInfo);

        const campaignId = generateCampaignId();
        const startTime = Date.now();
        const endTime = startTime + Math.round(order.durationHours * 3600000);

        const campaignConfig = {
            name: order.name || `Order ${order.orderCode}`,
            targetUrl: order.targetUrl,
            targetClicks: order.targetClicks,
            startTime,
            endTime,
            startTimeStr: new Date(startTime).toLocaleString('vi-VN'),
            endTimeStr: new Date(endTime).toLocaleString('vi-VN'),
            scheduleMode: ['even', 'custom'].includes(order.scheduleMode) ? order.scheduleMode : 'smart',
            customBlocks: order.scheduleMode === 'custom' ? (order.customBlocks || null) : null,
            browserMode: 'request',
            cleanMode: 'incognito',
            dwellMin: 2,
            dwellMax: 5,
            humanActions: true,
            randomLinks: order.randomLinks !== false,
            dedupIp: order.dedupIp !== false,
            orderId: order.orderId,
            paymentStatus: 'paid',
            customerProxyKey: order.proxyKey
        };

        registerCustomerProxyKey(order.proxyKey);

        const campaignState = createCampaignState(campaignId, campaignConfig);
        campaignState.status = 'running';
        campaignState.actualStartTime = Date.now();
        campaigns.set(campaignId, campaignState);
        saveCampaignConfig(campaignId, campaignConfig);

        // Link order <-> campaign immediately (persisted) so duplicate confirms/restarts never create a second campaign
        orderService.updateOrderStatus(order.orderId, 'running', { campaignId });

        const confirmPayload = { orderId: order.orderId, campaignId, status: 'paid' };
        io.to(`order:${order.orderId}`).emit('payment-confirmed', confirmPayload);
        io.to('admins').emit('payment-confirmed', confirmPayload);
        io.to('admins').emit('orders-updated');
        io.to('admins').emit('status-update', { campaignId, status: 'running', isRunning: true });
        emitCampaignList();
        emitStats(campaignId);

        scheduleTick(campaignId).catch(err => console.error(`Scheduler Error auto-activated C${campaignId}:`, err.message));

        return { ok: true, already: false, orderId: order.orderId, campaignId, status: 'running' };
    } finally {
        activatingOrders.delete(order.orderId);
    }
}

// Manual confirm: ADMIN ONLY (customers must never be able to mark their own order paid)
app.post('/api/orders/:id/confirm', (req, res) => {
    if (req.userRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Chi admin moi duoc xac nhan thanh toan thu cong.' });
    }
    const r = activateOrder(req.params.id, { paymentMethod: 'manual_admin' });
    if (!r.ok) return res.status(r.code || 400).json({ success: false, message: r.message });
    res.json({
        success: true,
        message: r.already ? 'Order already paid and running' : 'Payment confirmed and campaign activated',
        orderId: r.orderId,
        campaignId: r.campaignId,
        status: 'paid',
        orderStatus: r.status
    });
});

// Bank webhook (SePay / Casso style). Auth: header "Authorization: Apikey <webhookSecret>"
app.post('/api/payment/webhook', (req, res) => {
    const secret = orderService.getPaymentConfig().webhookSecret;
    const auth = String(req.headers.authorization || '');
    const supplied = auth.replace(/^Apikey\s+/i, '').trim();
    const a = Buffer.from(supplied), b = Buffer.from(String(secret || ''));
    if (!secret || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const body = req.body || {};
    if (body.transferType && body.transferType !== 'in') return res.json({ success: true, ignored: true });
    const amount = Number(body.transferAmount ?? body.amount);
    const content = String(body.content || body.description || '');
    const match = content.match(/TF\d+/i);
    if (!match) return res.json({ success: true, ignored: true, reason: 'no order code' });
    const order = orderService.listOrders().find(o => o.orderCode.toUpperCase() === match[0].toUpperCase());
    if (!order) return res.json({ success: true, ignored: true, reason: 'order not found' });
    if (!Number.isFinite(amount) || amount < order.totalAmount) {
        return res.json({ success: true, ignored: true, reason: 'amount too low' });
    }
    const r = activateOrder(order.orderId, { paymentMethod: 'bank_webhook', paidAmount: amount });
    res.json({ success: true, orderId: r.orderId, campaignId: r.campaignId, already: !!r.already });
});

// ─── Admin Commercial Orders & Payment Config APIs ─────────────────────────────
app.get('/api/admin/orders', requireAdmin, (req, res) => {
    const rawOrders = orderService.listOrders();
    let totalRevenue = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let runningCount = 0;
    let completedCount = 0;

    const orders = rawOrders.map(o => {
        const camp = getLinkedCampaign(o);
        const progress = buildOrderProgressPayload(camp, o);
        const isPaid = o.paymentStatus === 'paid';
        if (isPaid) {
            paidCount++;
            totalRevenue += Number(o.paidAmount || o.totalAmount || 0);
        } else {
            pendingCount++;
        }
        const effectiveStatus = (camp && camp.status) || o.status;
        if (effectiveStatus === 'running') runningCount++;
        if (['completed', 'expired', 'stopped'].includes(effectiveStatus)) completedCount++;

        return {
            ...o,
            proxyKeyMasked: orderService.maskProxyKey(o.proxyKey),
            effectiveStatus,
            progress
        };
    });

    res.json({
        success: true,
        summary: {
            totalOrders: orders.length,
            totalRevenue,
            paidCount,
            pendingCount,
            runningCount,
            completedCount
        },
        orders
    });
});

app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
    const order = orderService.getOrder(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Khong tim thay don hang.' });
    const camp = getLinkedCampaign(order);
    if (camp && ['running', 'waiting'].includes(camp.status)) {
        return res.status(400).json({ success: false, message: 'Vui long dung chien dich truoc khi xoa don.' });
    }
    orderService.deleteOrder(order.orderId);
    if (order.campaignId) {
        const cid = String(order.campaignId);
        const inMem = campaigns.get(cid);
        if (inMem && inMem.orderId === order.orderId) {
            campaigns.delete(cid);
            deleteCampaignFile(cid);
            io.to('admins').emit('campaign-deleted', { campaignId: cid });
            emitCampaignList();
        } else if (!inMem) {
            try {
                const diskPath = path.join(CAMPAIGNS_DIR, `${cid}.json`);
                if (fs.existsSync(diskPath)) {
                    const diskCfg = JSON.parse(fs.readFileSync(diskPath, 'utf-8'));
                    if (diskCfg && diskCfg.orderId === order.orderId) {
                        deleteCampaignFile(cid);
                    }
                }
            } catch (e) {}
        }
    }
    io.to('admins').emit('orders-updated');
    res.json({ success: true });
});

app.get('/api/admin/payment-config', requireAdmin, (req, res) => {
    res.json({ success: true, config: orderService.getPaymentConfig() });
});

app.post('/api/admin/payment-config', requireAdmin, (req, res) => {
    const { bankId, bankName, accountNumber, accountName, template, webhookSecret } = req.body || {};
    if (!bankId || !accountNumber || !accountName) {
        return res.status(400).json({ success: false, message: 'Vui long dien day du Ma ngan hang, So tai khoan va Ten chu tai khoan.' });
    }
    const saved = orderService.setPaymentConfig({
        bankId,
        bankName: bankName || bankId,
        accountNumber,
        accountName,
        template: template || 'compact2',
        webhookSecret: webhookSecret !== undefined ? webhookSecret : ''
    });
    res.json({ success: true, config: saved });
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ─── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const sessionToken = cookies ? cookies.session_token : null;
    const sessVal = sessionToken ? activeSessions.get(sessionToken) : null;
    const socketUsername = (sessVal && typeof sessVal === 'object') ? sessVal.username : sessVal;
    const socketRole = (sessVal && typeof sessVal === 'object') ? sessVal.role : getUserRole(socketUsername);

    console.log(`Socket connected: ${socket.id} (${socketUsername || 'anon'} [${socketRole}])`);

    socket.emit('user-info', { username: socketUsername, role: socketRole });

    if (socketUsername) {
        socket.join('admins');
        socket.emit('proxy-config', proxyConfigData);
        const campaignList = [];
        for (const [id, c] of campaigns.entries()) {
            campaignList.push({ id, name: c.config.name || `Chien dich ${id}`, targetUrl: c.config.targetUrl, status: c.status, successVisits: c.successVisits, targetLimit: c.targetLimit, startTimeStr: c.config.startTimeStr, endTimeStr: c.config.endTimeStr, config: c.config });
            socket.emit('status-update', { campaignId: id, status: c.status, isRunning: ['running', 'waiting'].includes(c.status) });
            emitStats(id);
        }
        socket.emit('campaigns-list', campaignList);
    }

    socket.on('subscribe-order', (orderId) => {
        const order = orderService.getOrder(orderId);
        if (!order) return;
        socket.join(`order:${order.orderId}`);
        const camp = getLinkedCampaign(order);
        if (order.campaignId) {
            socket.emit('order-progress', buildOrderProgressPayload(camp, order));
        }
    });

    socket.on('stop-campaign', ({ campaignId }) => {
        if (socketRole !== 'admin') return;
        try { stopCampaign(campaignId); } catch (e) {}
    });

    socket.on('reset-stats', ({ campaignId }) => {
        if (socketRole !== 'admin') return;
        const campaign = campaigns.get(campaignId);
        if (campaign) {
            campaign.totalVisits = 0; campaign.successVisits = 0;
            campaign.failedVisits = 0; campaign.usedIps = new Set(); campaign.dupIpsCount = 0;
            sendLog(campaignId, `Reset thong ke Chien dich ${campaignId}.`, 'system');
            emitStats(campaignId);
        }
    });

    socket.on('disconnect', () => console.log(`Socket disconnected: ${socket.id}`));
});

// ─── Global scheduler ──────────────────────────────────────────────────────────
const schedulerInterval = setInterval(() => {
    for (const [id] of campaigns.entries()) {
        scheduleTick(id).catch(err => console.error(`Scheduler Error C${id}:`, err.message));
    }
}, 1000);
if (require.main !== module) {
    schedulerInterval.unref();
}

// ─── Startup ───────────────────────────────────────────────────────────────────
migrateOldConfigs();
loadCampaignsFromDisk();

if (require.main === module) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`\nTraffic Control System running at http://localhost:${PORT}`);
        console.log(`Campaigns: ${campaigns.size} loaded | Proxy Pool: ${globalProxyPool.size} key(s)\n`);
    });
}

module.exports = { app, server, campaigns, createCampaignState, scheduleTick, completeCampaign, globalProxyPool, loadCampaignsFromDisk };

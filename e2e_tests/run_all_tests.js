#!/usr/bin/env node
/**
 * Master Opaque-Box E2E Test Runner for Commercial Traffic Server
 * Executes test suites across Tier 1 (Features), Tier 2 (Boundaries),
 * Tier 3 (Combinations), and Tier 4 (Real-World Scenarios).
 */

const fs = require('fs');
const path = require('path');
const { TestContext } = require('./helpers/test_context');

// ANSI Color Codes
const C = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        tier: 'all',
        feature: null,
        bail: false,
        verbose: false,
        serverUrl: null,
        port: null,
        report: null
    };

    for (const arg of args) {
        if (arg.startsWith('--tier=')) {
            options.tier = arg.split('=')[1].trim();
        } else if (arg.startsWith('--feature=')) {
            options.feature = arg.split('=')[1].trim().toUpperCase();
        } else if (arg === '--bail') {
            options.bail = true;
        } else if (arg === '--verbose') {
            options.verbose = true;
        } else if (arg.startsWith('--server-url=')) {
            options.serverUrl = arg.split('=')[1].trim();
        } else if (arg.startsWith('--port=')) {
            options.port = parseInt(arg.split('=')[1].trim(), 10);
        } else if (arg.startsWith('--report=')) {
            options.report = arg.split('=')[1].trim();
        } else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }
    }

    return options;
}

function printHelp() {
    console.log(`
${C.bright}Commercial Traffic Server E2E Master Test Runner${C.reset}

Usage:
  node e2e_tests/run_all_tests.js [options]

Options:
  --tier=<N>         Filter by tier: 1, 2, 3, 4, or 'all' (default: all)
  --feature=<ID>     Filter by feature ID: F01 through F23
  --bail             Abort execution immediately on first test failure
  --server-url=<URL> Run tests against external server URL (skips child spawn)
  --port=<PORT>      Explicit server port (defaults to ephemeral)
  --verbose          Display detailed assertion logs and diagnostics
  --report=<FILE>    Export test results summary to JSON file
  --help, -h         Display this help message
`);
}

function discoverTestFiles(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.test.js'))
        .map(f => path.join(dirPath, f))
        .sort();
}

async function run() {
    const options = parseArgs();
    const startTime = Date.now();

    console.log(`${C.bright}${C.cyan}========================================================================================${C.reset}`);
    console.log(`${C.bright}${C.cyan}                 COMMERCIAL TRAFFIC SERVER E2E TEST SUITE RUNNER                        ${C.reset}`);
    console.log(`${C.bright}${C.cyan}========================================================================================${C.reset}`);
    console.log(`${C.gray}Options:${C.reset} Tier=${options.tier} | Feature=${options.feature || 'ALL'} | Bail=${options.bail} | Verbose=${options.verbose}\n`);

    const ctx = new TestContext(options);
    let setupOk = false;

    try {
        console.log(`${C.blue}▶ Initializing test environment & mock services...${C.reset}`);
        await ctx.setup();
        setupOk = true;
        console.log(`${C.green}✔ Test server ready at ${ctx.serverUrl}${C.reset}`);
        console.log(`${C.green}✔ Mock Target ready at ${ctx.mockTarget.url}${C.reset}`);
        console.log(`${C.green}✔ Mock KiotProxy ready at ${ctx.mockKiot.url}${C.reset}\n`);
    } catch (err) {
        console.error(`${C.red}✖ Failed to start test environment: ${err.message}${C.reset}`);
        if (ctx) await ctx.teardown().catch(() => {});
        process.exit(1);
    }

    // Determine target directories based on tier
    const tiersToRun = [];
    if (options.tier === 'all' || options.tier === '1') tiersToRun.push({ tier: 1, dir: 'tier1_features', name: 'Tier 1: Feature Coverage (F01 - F23)' });
    if (options.tier === 'all' || options.tier === '2') tiersToRun.push({ tier: 2, dir: 'tier2_boundaries', name: 'Tier 2: Boundary & Corner Cases' });
    if (options.tier === 'all' || options.tier === '3') tiersToRun.push({ tier: 3, dir: 'tier3_combinations', name: 'Tier 3: Combinatorial Interactions' });
    if (options.tier === 'all' || options.tier === '4') tiersToRun.push({ tier: 4, dir: 'tier4_real_world', name: 'Tier 4: Real-World Workloads' });

    const results = {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        tierStats: {},
        failures: []
    };

    let shouldBail = false;

    try {
        for (const tierConfig of tiersToRun) {
            if (shouldBail) break;
            console.log(`\n${C.bright}${C.magenta}--- ${tierConfig.name} ---${C.reset}`);
            const tierDir = path.join(__dirname, tierConfig.dir);
            const files = discoverTestFiles(tierDir);

            const tierStat = { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 };
            const tierStart = Date.now();

            for (const filePath of files) {
                if (shouldBail) break;
                let suite;
                try {
                    suite = require(filePath);
                } catch (err) {
                    console.error(`${C.red}✖ Error loading suite ${path.basename(filePath)}: ${err.message}${C.reset}`);
                    results.failed++;
                    tierStat.failed++;
                    results.failures.push({
                        id: path.basename(filePath),
                        name: 'Suite Load',
                        error: err.message
                    });
                    if (options.bail) {
                        shouldBail = true;
                        break;
                    }
                    continue;
                }

                const tests = Array.isArray(suite) ? suite : (suite.tests || []);
                for (const test of tests) {
                    // Apply feature filter if specified
                    if (options.feature) {
                        const feat = Array.isArray(test.feature) ? test.feature : [test.feature];
                        if (!feat.includes(options.feature)) {
                            continue;
                        }
                    }

                    results.total++;
                    tierStat.total++;

                    const testStart = Date.now();
                    process.stdout.write(`  [${test.id}] ${test.name} ... `);

                    try {
                        // Reset mocks before each test
                        ctx.mockTarget.reset();
                        ctx.mockKiot.reset();

                        await test.fn(ctx);

                        const duration = Date.now() - testStart;
                        console.log(`${C.green}PASS${C.reset} ${C.dim}(${duration}ms)${C.reset}`);
                        results.passed++;
                        tierStat.passed++;
                    } catch (err) {
                        const duration = Date.now() - testStart;
                        console.log(`${C.red}FAIL${C.reset} ${C.dim}(${duration}ms)${C.reset}`);
                        console.log(`    ${C.red}↳ ${err.message}${C.reset}`);
                        if (options.verbose && err.stack) {
                            console.log(`    ${C.gray}${err.stack.split('\n').slice(1, 4).join('\n    ')}${C.reset}`);
                        }
                        results.failed++;
                        tierStat.failed++;
                        results.failures.push({
                            id: test.id,
                            name: test.name,
                            feature: test.feature,
                            error: err.message,
                            stack: err.stack
                        });

                        if (options.bail) {
                            shouldBail = true;
                            break;
                        }
                    }
                }
            }

            tierStat.durationMs = Date.now() - tierStart;
            results.tierStats[tierConfig.name] = tierStat;
        }
    } finally {
        results.durationMs = Date.now() - startTime;

        // Teardown always runs to restore sessions.json, payment_config.json, and remove test artifacts
        console.log(`\n${C.blue}▶ Tearing down test environment...${C.reset}`);
        await ctx.teardown().catch(() => {});
        console.log(`${C.green}✔ Teardown complete.${C.reset}\n`);
    }

    // Print Final Summary Box
    console.log(`${C.bright}${C.cyan}========================================================================================${C.reset}`);
    console.log(`${C.bright}${C.cyan}                          COMMERCIAL TRAFFIC SERVER E2E TEST REPORT                     ${C.reset}`);
    console.log(`${C.bright}${C.cyan}========================================================================================${C.reset}`);
    console.log(`┌──────────────────────────────────────────┬──────────┬──────────┬──────────┬──────────┐`);
    console.log(`│ Test Tier                                │ Total    │ Passed   │ Failed   │ Duration │`);
    console.log(`├──────────────────────────────────────────┼──────────┼──────────┼──────────┼──────────┤`);

    for (const [tierName, stats] of Object.entries(results.tierStats)) {
        const paddedName = tierName.padEnd(40, ' ');
        const total = String(stats.total).padEnd(8, ' ');
        const passed = String(stats.passed).padEnd(8, ' ');
        const failed = String(stats.failed).padEnd(8, ' ');
        const dur = `${(stats.durationMs / 1000).toFixed(2)}s`.padEnd(8, ' ');
        console.log(`│ ${paddedName} │ ${total} │ ${passed} │ ${failed} │ ${dur} │`);
    }

    console.log(`├──────────────────────────────────────────┼──────────┼──────────┼──────────┼──────────┤`);
    const totalPadded = 'TOTAL SUITE'.padEnd(40, ' ');
    const totAll = String(results.total).padEnd(8, ' ');
    const passAll = String(results.passed).padEnd(8, ' ');
    const failAll = String(results.failed).padEnd(8, ' ');
    const durAll = `${(results.durationMs / 1000).toFixed(2)}s`.padEnd(8, ' ');
    console.log(`│ ${C.bright}${totalPadded}${C.reset} │ ${totAll} │ ${passAll} │ ${failAll} │ ${durAll} │`);
    console.log(`└──────────────────────────────────────────┴──────────┴──────────┴──────────┴──────────┘`);

    if (results.failures.length > 0) {
        console.log(`\n${C.bright}${C.red}Failures Summary (${results.failures.length}):${C.reset}`);
        results.failures.forEach((f, idx) => {
            console.log(`  ${idx + 1}. [${f.id}] ${f.name}`);
            console.log(`     ${C.red}${f.error}${C.reset}`);
        });
    }

    const allPassed = results.failed === 0 && results.total > 0;
    console.log(`\nStatus: ${allPassed ? `${C.green}${C.bright}ALL TESTS PASSED (Exit Code 0)${C.reset}` : `${C.red}${C.bright}TESTS FAILED (Exit Code 1)${C.reset}`}`);
    console.log(`Total Duration: ${(results.durationMs / 1000).toFixed(2)}s | Timestamp: ${new Date().toISOString()}`);
    console.log(`${C.cyan}========================================================================================${C.reset}\n`);

    if (options.report) {
        fs.writeFileSync(options.report, JSON.stringify(results, null, 2), 'utf-8');
        console.log(`Report exported to: ${options.report}`);
    }

    process.exit(allPassed ? 0 : 1);
}

if (require.main === module) {
    run().catch(err => {
        console.error('Fatal test runner error:', err);
        process.exit(1);
    });
}

module.exports = { run };

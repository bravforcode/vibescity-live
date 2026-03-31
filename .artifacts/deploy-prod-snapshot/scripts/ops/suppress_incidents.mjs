#!/usr/bin/env node

/**
 * Incident Suppression Helper
 * Generates the INCIDENT_SUPPRESS_WINDOWS_UTC JSON for use in CI/CD or .env.
 *
 * Usage:
 * node scripts/ops/suppress_incidents.mjs --start "2023-10-27T10:00:00Z" --end "2023-10-27T12:00:00Z" --reason "Database Migration"
 * node scripts/ops/suppress_incidents.mjs --clear
 */

const fs = require('fs');

function parseArgs() {
    const args = process.argv.slice(2);
    const config = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--start') config.start = args[++i];
        if (args[i] === '--end') config.end = args[++i];
        if (args[i] === '--reason') config.reason = args[++i];
        if (args[i] === '--clear') config.clear = true;
    }
    return config;
}

function main() {
    const config = parseArgs();

    if (config.clear) {
        console.log("[]");
        console.error("Suppression windows cleared.");
        return;
    }

    if (!config.start || !config.end || !config.reason) {
        console.error("Usage: node scripts/ops/suppress_incidents.mjs --start <ISO> --end <ISO> --reason <TEXT>");
        process.exit(1);
    }

    const start = new Date(config.start);
    const end = new Date(config.end);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.error("Invalid date format. Use ISO 8601 (e.g., 2023-10-27T10:00:00Z)");
        process.exit(1);
    }

    const window = {
        start: start.toISOString(),
        end: end.toISOString(),
        reason: config.reason
    };

    // In a real scenario, this might read existing windows and append specific logic.
    // For now, it outputs a single-window array JSON for easy copy-pasting.
    const output = JSON.stringify([window]);

    console.log(output);
    console.error(`\nGenerated suppression window JSON.\nAdd this to your environment variables as INCIDENT_SUPPRESS_WINDOWS_UTC\n`);
}

main();

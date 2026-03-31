/**
 * Convert JUnit XML → Sonar Generic Test Execution XML
 * Usage:
 *   node junit-to-sonar-generic.js input.xml output.xml
 */
import fs from "fs";
import { parseStringPromise } from "xml2js";

const [,, input, output] = process.argv;

if (!input || !output) {
  console.error("Usage: node junit-to-sonar-generic.js <input> <output>");
  process.exit(1);
}

// ✅ Read and parse with error handling
let xml;
try {
  xml = fs.readFileSync(input, "utf8");
} catch (err) {
  console.error(`❌ Failed to read input file "${input}":`, err.message);
  process.exit(1);
}

let junit;
try {
  junit = await parseStringPromise(xml);
} catch (err) {
  console.error(`❌ Failed to parse XML from "${input}":`, err.message);
  process.exit(1);
}

const testcases =
  junit.testsuites?.testsuite?.flatMap(s => s.testcase || []) || [];

const sonar = {
  testExecutions: {
    $: { version: "1" },
    file: [{
      $: { path: "e2e" },
      testCase: testcases.map(tc => ({
        $: {
          name: tc.$.name,
          duration: Math.round((Number(tc.$.time) || 0) * 1000),
        },
        ...(tc.failure ? { failure: [{}] } : {}),
      })),
    }],
  },
};

const builder = new (await import("xml2js")).Builder();
fs.writeFileSync(output, builder.buildObject(sonar));
console.log("✅ Sonar Generic report written:", output);

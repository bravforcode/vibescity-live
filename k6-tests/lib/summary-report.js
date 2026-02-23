export function buildHtmlReport(data) {
  const metrics = data.metrics || {};
  const getValue = (metricName, stat) => {
    const metric = metrics[metricName];
    if (!metric || !metric.values) {
      return undefined;
    }
    return metric.values[stat];
  };
  const rows = [
    ["http_req_duration", "p(95)", getValue("http_req_duration", "p(95)")],
    ["http_req_duration", "avg", getValue("http_req_duration", "avg")],
    ["http_req_duration", "max", getValue("http_req_duration", "max")],
    ["http_req_failed", "rate", getValue("http_req_failed", "rate")],
    ["checks", "rate", getValue("checks", "rate")],
    ["iterations", "count", getValue("iterations", "count")],
    ["vus", "max", getValue("vus_max", "value")],
  ];

  const format = (value) =>
    value === undefined || value === null ? "-" : Number(value).toFixed(3);

  const tableRows = rows
    .map(
      ([metric, stat, value]) =>
        `<tr><td>${metric}</td><td>${stat}</td><td>${format(value)}</td></tr>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>k6 Load Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
    h1 { margin-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; max-width: 900px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f3f4f6; }
    .meta { margin-bottom: 16px; color: #555; }
    pre { background: #0f172a; color: #e2e8f0; padding: 12px; overflow: auto; }
  </style>
</head>
<body>
  <h1>k6 Load Test Report</h1>
  <div class="meta">Generated at: ${new Date().toISOString()}</div>
  <table>
    <thead>
      <tr><th>Metric</th><th>Stat</th><th>Value</th></tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
  <h2>Raw Summary</h2>
  <pre>${JSON.stringify(data, null, 2)}</pre>
</body>
</html>`;
}

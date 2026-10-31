const escapeXml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const palette = ["#2563eb", "#0e7490", "#15803d", "#b45309", "#7c3aed", "#be123c", "#475569", "#0f766e"];

function wrap(value, width = 92) {
  const lines = [];
  let line = "";
  for (const word of String(value).split(/\s+/)) {
    if (line && (line + " " + word).length > width) { lines.push(line); line = ""; }
    // Split long filter values too, so no text is lost in the exported image.
    for (let offset = 0; offset < word.length; offset += width) {
      const piece = word.slice(offset, offset + width);
      if (offset) { lines.push(line); line = ""; }
      line += (line ? " " : "") + piece;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function chartContext(filters, total, generatedAt) {
  const labels = { project: "Project", location: "Location contains", description: "Description contains",
    action: "Action", type: "Type", department: "Discipline", status: "Status", scope: "Records",
    dateFrom: "From", dateTo: "To" };
  const values = ["Project: " + (filters.project === "all" || !filters.project ? "All projects" : filters.project)];
  for (const [key, label] of Object.entries(labels)) {
    if (key !== "project" && filters[key] && filters[key] !== "all") values.push(label + ": " + (filters[key] === "none" ? "No action" : filters[key]));
  }
  values.push(`Matching records: ${total || 0}`, `Export date: ${new Date(generatedAt || Date.now()).toLocaleString("en-GB")}`);
  return values;
}

export function buildChartSvg({ title, values = {}, context = [], timeline = false }) {
  const lines = context.flatMap((value) => wrap(value));
  const chartTop = 80 + lines.length * 19;
  let rows = Object.entries(values).filter(([, count]) => Number(count) > 0);
  if (timeline) rows = rows.filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort((a, b) => a[0].localeCompare(b[0])).slice(-18);
  else {
    rows.sort((a, b) => b[1] - a[1]);
    if (rows.length > 8) rows = [...rows.slice(0, 7), ["Other", rows.slice(7).reduce((sum, [, count]) => sum + count, 0)]];
  }
  const max = Math.max(...rows.map(([, n]) => n), 1);
  const bars = rows.map(([label, count], index) => {
    const labelLines = wrap(label, 30);
    return { labelLines, count, color: palette[index % palette.length], height: Math.max(48, labelLines.length * 16 + 18) };
  });
  const plotHeight = timeline ? 260 : Math.max(150, bars.reduce((sum, row) => sum + row.height, 0));
  const height = chartTop + plotHeight + 40;
  const text = (x, y, value, size = 13, extra = "") => `<text x="${x}" y="${y}" font-size="${size}" fill="#334155" ${extra}>${escapeXml(value)}</text>`;
  let body = "";
  if (timeline && rows.length) {
    const points = rows.map(([, n], i) => [70 + i * 610 / Math.max(rows.length - 1, 1), chartTop + 205 - n / max * 160]);
    body += `<line x1="70" y1="${chartTop + 205}" x2="705" y2="${chartTop + 205}" stroke="#cbd5e1"/><polyline points="${points.map(p => p.join(",")).join(" ")}" fill="none" stroke="#2563eb" stroke-width="3"/>`;
    rows.forEach(([date, n], i) => {
      const [x, y] = points[i];
      body += `<circle cx="${x}" cy="${y}" r="4" fill="#2563eb"/>` + text(x, y - 12, n, 12, 'text-anchor="middle"');
      if (i === 0 || i === rows.length - 1 || i % 4 === 0) body += text(x, chartTop + 228, date, 11, 'text-anchor="middle"');
    });
    body += text(35, height - 15, "Last 18 dates with records. Date basis: received date, or submitted date when unavailable.", 11);
  } else {
    let y = chartTop;
    for (const row of bars) {
      row.labelLines.forEach((label, index) => { body += text(30, y + 19 + index * 16, label, 12); });
      const width = row.count / max * 420;
      body += `<rect x="260" y="${y + 3}" width="${width}" height="24" rx="4" fill="${row.color}"/>`;
      body += text(270 + width, y + 20, row.count, 13, 'font-weight="700"');
      y += row.height;
    }
  }
  if (!rows.length) body += text(380, chartTop + 70, "No records match these filters", 15, 'text-anchor="middle"');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="${height}" viewBox="0 0 760 ${height}" role="img" aria-label="${escapeXml(title)}" style="font-family:Arial,sans-serif"><rect width="760" height="${height}" fill="#ffffff"/>${text(30, 32, title, 21, 'font-weight="700"')}${lines.map((line, index) => text(30, 57 + index * 19, line, 12)).join("")}<line x1="30" y1="${chartTop - 12}" x2="730" y2="${chartTop - 12}" stroke="#e2e8f0"/>${body}</svg>`;
}

export async function saveChart(svg, filename, format = "png") {
  const source = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  let blob = source;
  if (format === "png") {
    const url = URL.createObjectURL(source);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
      const canvas = document.createElement("canvas");
      canvas.width = image.width * 2; canvas.height = image.height * 2;
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not create the chart image");
    } finally { URL.revokeObjectURL(url); }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename + "." + format;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

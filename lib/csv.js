const COLUMNS = [
  "date", "paire", "direction", "account", "setup",
  "entry", "sl", "tp", "exit",
  "profitLoss", "riskReward", "result", "isManualResult", "notes",
];

function escapeCsv(value) {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function tradesToCSV(trades) {
  const header = COLUMNS.join(",");
  const rows = trades.map((t) => COLUMNS.map((col) => escapeCsv(t[col])).join(","));
  return [header, ...rows].join("\n");
}

export function downloadCSV(csvString, filename = "trades-export.csv") {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Parseur CSV simple, gère les guillemets et les virgules échappées. */
function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { current += char; }
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ",") { result.push(current); current = ""; }
      else current += char;
    }
  }
  result.push(current);
  return result;
}

const NUMERIC_FIELDS = ["entry", "sl", "tp", "exit", "profitLoss", "riskReward"];

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const obj = {};
    header.forEach((col, i) => {
      let val = values[i] ?? "";
      if (NUMERIC_FIELDS.includes(col)) {
        obj[col] = val === "" ? null : parseFloat(val);
      } else if (col === "isManualResult") {
        obj[col] = val === "true";
      } else {
        obj[col] = val;
      }
    });
    return obj;
  });
}

function uniqueValues(...sources) {
  const seen = new Set();
  return sources.flatMap((source) => Array.isArray(source) ? source : [source])
    .map((value) => String(value ?? "").trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function documentReferences(item) {
  return {
    irAttach: uniqueValues(item.tags?.engineer, item.irAttach, item.irAttatch),
    refSD: uniqueValues(item.refDrawings, item.refSD, item.SDAttatch, item.sdAttachment, item.SDattach, item.sdAttach, item.tags?.sd),
    refMethod: String(item.refMethod || item.RefMethod || "").trim(),
  };
}

export function displayTimestamp(value) {
  if (!value) return { date: "—", time: "" };
  const raw = String(value).trim();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { date: raw, time: "" };
  const options = { timeZone: "Africa/Cairo" };
  return {
    date: new Intl.DateTimeFormat("en-GB", { ...options, day: "2-digit", month: "short", year: "numeric" }).format(date),
    time: /^\d{4}-\d{2}-\d{2}$/.test(raw) ? "" : new Intl.DateTimeFormat("en-GB", { ...options, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date),
  };
}

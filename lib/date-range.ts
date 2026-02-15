export type PresetKey = "today" | "yesterday" | "week" | "month" | "3months" | "year";

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function rangeByPreset(preset: PresetKey) {
  const now = new Date();
  if (preset === "today") {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }

  const from = startOfDay(now);
  if (preset === "week") from.setDate(from.getDate() - 6);
  if (preset === "month") from.setMonth(from.getMonth() - 1);
  if (preset === "3months") from.setMonth(from.getMonth() - 3);
  if (preset === "year") from.setFullYear(from.getFullYear() - 1);
  return { from, to: endOfDay(now) };
}

export function toDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}


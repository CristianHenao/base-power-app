/** Display helpers for the report. Values arrive computed; these only round and label. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(index: number): string {
  return MONTHS[index] ?? "";
}

export function hours(value: number | null | undefined): string {
  if (value == null) return "n/a";
  return `${Math.round(value)} h`;
}

export function percent(value: number | null | undefined): string {
  if (value == null) return "n/a";
  return `${Math.floor(value * 100)}%`;
}

/** [rotate, stay] bounds shown low to high; the order is not low/high in the data. */
export function band(pair: [number | null, number | null]): string {
  const values = pair.filter((v): v is number => v != null).sort((a, b) => a - b);
  if (values.length === 0) return "n/a";
  const [low, high] = [Math.round(values[0]), Math.round(values[values.length - 1])];
  return low === high ? `about ${low} h` : `${low}-${high} h`;
}

export function centralDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  });
}

export function centralTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  });
}

export async function simulateLatency(min = 120, max = 400): Promise<void> {
  const ms = Math.floor(min + Math.random() * (max - min));
  await new Promise((r) => setTimeout(r, ms));
}

export function swatchFor(hue: number): string {
  return `oklch(0.72 0.12 ${hue})`;
}

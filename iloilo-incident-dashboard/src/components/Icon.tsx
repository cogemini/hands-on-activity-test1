const paths = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  map: 'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2V5z M9 3v16 M15 5v16',
  plus: 'M12 5v14 M5 12h14',
  list: 'M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01',
  chart: 'M4 3v17h17 M9 15v-4 M14 15V6 M19 15V9',
  info: 'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  arrow: 'M6 18L18 6 M6 6h12v12',
  layers: 'M12 3l10 6-10 6L2 9l10-6z M2 13l10 6 10-6 M2 17l10 6 10-6',
  close: 'M6 6l12 12 M6 18L18 6',
  target: 'M9 3H3v6 M15 3h6v6 M3 15v6h6 M21 15v6h-6 M12 8v8 M8 12h8',
  minus: 'M5 12h14',
  shield: 'M12 3l8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3z M8 12l3 3 5-6',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0z M14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}

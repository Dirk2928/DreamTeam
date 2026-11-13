export const PASIG_CENTER = { lat: 14.5764, lng: 121.0851 } as const;

export const PASIG_BOUNDS: [[number, number], [number, number]] = [
  [14.5, 121.04],
  [14.65, 121.15],
];

export const PASIG_BARANGAYS = [
  "Bagong Ilog",
  "Bagong Katipunan",
  "Bambang",
  "Buting",
  "Caniogan",
  "Dela Paz",
  "Kalawaan",
  "Kapasigan",
  "Kapitolyo",
  "Malinao",
  "Manggahan",
  "Maybunga",
  "Oranbo",
  "Palatiw",
  "Pinagbuhatan",
  "Pineda",
  "Rosario",
  "Sagad",
  "San Antonio",
  "San Joaquin",
  "San Jose",
  "San Miguel",
  "San Nicolas",
  "Santa Cruz",
  "Santa Lucia",
  "Santa Rosa",
  "Santo Tomas",
  "Santolan",
  "Sumilang",
  "Ugong",
] as const;

export function isWithinPasigBounds(lat: number, lng: number) {
  return lat >= PASIG_BOUNDS[0][0] && lat <= PASIG_BOUNDS[1][0]
    && lng >= PASIG_BOUNDS[0][1] && lng <= PASIG_BOUNDS[1][1];
}

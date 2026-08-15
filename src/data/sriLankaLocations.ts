// src/data/sriLankaLocations.ts
// Mock cascading location dataset for Screen M-02 (Province -> District -> City).
// Expand freely — structure is what matters for the cascading selector logic.

export type LocationTree = Record<string, Record<string, string[]>>;

export const SRI_LANKA_LOCATIONS: LocationTree = {
  Western: {
    Colombo: ['Colombo', 'Maharagama', 'Kotte', 'Moratuwa', 'Homagama'],
    Gampaha: ['Gampaha', 'Negombo', 'Ja-Ela', 'Wattala'],
    Kalutara: ['Kalutara', 'Panadura', 'Horana'],
  },
  Central: {
    Kandy: ['Kandy', 'Gampola', 'Peradeniya'],
    Matale: ['Matale', 'Dambulla'],
    'Nuwara Eliya': ['Nuwara Eliya', 'Hatton', 'Nanu Oya'],
  },
  Southern: {
    Galle: ['Galle', 'Hikkaduwa', 'Ambalangoda'],
    Matara: ['Matara', 'Weligama'],
    Hambantota: ['Hambantota', 'Tissamaharama'],
  },
  Northern: {
    Jaffna: ['Jaffna', 'Chavakachcheri'],
    Vavuniya: ['Vavuniya'],
    Mannar: ['Mannar'],
  },
  Eastern: {
    Trincomalee: ['Trincomalee'],
    Batticaloa: ['Batticaloa'],
    Ampara: ['Ampara', 'Kalmunai'],
  },
  'North Western': {
    Kurunegala: ['Kurunegala', 'Kuliyapitiya'],
    Puttalam: ['Puttalam', 'Chilaw'],
  },
  'North Central': {
    Anuradhapura: ['Anuradhapura'],
    Polonnaruwa: ['Polonnaruwa'],
  },
  Uva: {
    Badulla: ['Badulla', 'Bandarawela'],
    Monaragala: ['Monaragala'],
  },
  Sabaragamuwa: {
    Ratnapura: ['Ratnapura', 'Balangoda'],
    Kegalle: ['Kegalle'],
  },
};

export const PROVINCES = Object.keys(SRI_LANKA_LOCATIONS);

export const getDistricts = (province: string | null): string[] =>
  province ? Object.keys(SRI_LANKA_LOCATIONS[province] ?? {}) : [];

export const getCities = (province: string | null, district: string | null): string[] =>
  province && district ? SRI_LANKA_LOCATIONS[province]?.[district] ?? [] : [];
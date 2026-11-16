/**
 * Shared location helpers: used by the services (validation, distance) and the web tier (district picker).
 * Pure TypeScript, no dependencies, so it can be imported from both without a build step.
 */

/** Generous box around Bangladesh. A shop pinned outside it is almost always a typo or a swapped lat/lng. */
export const BD_BOUNDS = { minLat: 20.4, maxLat: 26.8, minLng: 87.9, maxLng: 92.8 } as const;

export interface Coords { lat: number; lng: number }

/** Parses and range-checks a coordinate pair. Returns null when either value is missing, not a number or outside Bangladesh. */
export function parseCoords(lat: unknown, lng: unknown): Coords | null {
  if (lat === null || lat === undefined || lat === "" || lng === null || lng === undefined || lng === "") return null;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < BD_BOUNDS.minLat || a > BD_BOUNDS.maxLat || b < BD_BOUNDS.minLng || b > BD_BOUNDS.maxLng) return null;
  return { lat: a, lng: b };
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Smallest and largest radius an admin can set (km). */
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 500;

export interface District { id: string; en: string; bn: string; lat: number; lng: number }

const d = (id: string, en: string, bn: string, lat: number, lng: number): District => ({ id, en, bn, lat, lng });

/** All 64 districts with an approximate centre. Used as a starting point for the map and as a buyer fallback when GPS is off. */
export const DISTRICTS: readonly District[] = [
  // Dhaka
  d("dhaka", "Dhaka", "ঢাকা", 23.8103, 90.4125), d("gazipur", "Gazipur", "গাজীপুর", 24.0023, 90.4264),
  d("narayanganj", "Narayanganj", "নারায়ণগঞ্জ", 23.6238, 90.5), d("narsingdi", "Narsingdi", "নরসিংদী", 23.9193, 90.7176),
  d("manikganj", "Manikganj", "মানিকগঞ্জ", 23.8617, 90.0003), d("munshiganj", "Munshiganj", "মুন্সিগঞ্জ", 23.5422, 90.5305),
  d("tangail", "Tangail", "টাঙ্গাইল", 24.2513, 89.9167), d("kishoreganj", "Kishoreganj", "কিশোরগঞ্জ", 24.4449, 90.7766),
  d("faridpur", "Faridpur", "ফরিদপুর", 23.607, 89.8429), d("gopalganj", "Gopalganj", "গোপালগঞ্জ", 23.005, 89.8266),
  d("madaripur", "Madaripur", "মাদারীপুর", 23.1641, 90.1896), d("rajbari", "Rajbari", "রাজবাড়ী", 23.7574, 89.6444),
  d("shariatpur", "Shariatpur", "শরীয়তপুর", 23.2423, 90.4348),
  // Chattogram
  d("chattogram", "Chattogram", "চট্টগ্রাম", 22.3569, 91.7832), d("coxs-bazar", "Cox's Bazar", "কক্সবাজার", 21.4272, 92.0058),
  d("cumilla", "Cumilla", "কুমিল্লা", 23.4607, 91.1809), d("brahmanbaria", "Brahmanbaria", "ব্রাহ্মণবাড়িয়া", 23.9571, 91.1115),
  d("chandpur", "Chandpur", "চাঁদপুর", 23.2333, 90.6713), d("feni", "Feni", "ফেনী", 23.0159, 91.3976),
  d("lakshmipur", "Lakshmipur", "লক্ষ্মীপুর", 22.9447, 90.8282), d("noakhali", "Noakhali", "নোয়াখালী", 22.8696, 91.0995),
  d("khagrachhari", "Khagrachhari", "খাগড়াছড়ি", 23.1193, 91.9847), d("rangamati", "Rangamati", "রাঙ্গামাটি", 22.7324, 92.2985),
  d("bandarban", "Bandarban", "বান্দরবান", 22.1953, 92.2184),
  // Rajshahi
  d("rajshahi", "Rajshahi", "রাজশাহী", 24.3745, 88.6042), d("bogura", "Bogura", "বগুড়া", 24.8465, 89.3773),
  d("joypurhat", "Joypurhat", "জয়পুরহাট", 25.0947, 89.0945), d("naogaon", "Naogaon", "নওগাঁ", 24.7936, 88.9318),
  d("natore", "Natore", "নাটোর", 24.4206, 89.0), d("chapainawabganj", "Chapainawabganj", "চাঁপাইনবাবগঞ্জ", 24.5965, 88.2775),
  d("pabna", "Pabna", "পাবনা", 24.0064, 89.2372), d("sirajganj", "Sirajganj", "সিরাজগঞ্জ", 24.4534, 89.7006),
  // Khulna
  d("khulna", "Khulna", "খুলনা", 22.8456, 89.5403), d("bagerhat", "Bagerhat", "বাগেরহাট", 22.6602, 89.7895),
  d("chuadanga", "Chuadanga", "চুয়াডাঙ্গা", 23.6401, 88.8418), d("jashore", "Jashore", "যশোর", 23.1665, 89.2081),
  d("jhenaidah", "Jhenaidah", "ঝিনাইদহ", 23.5448, 89.1539), d("kushtia", "Kushtia", "কুষ্টিয়া", 23.9013, 89.1205),
  d("magura", "Magura", "মাগুরা", 23.4873, 89.4194), d("meherpur", "Meherpur", "মেহেরপুর", 23.7622, 88.6318),
  d("narail", "Narail", "নড়াইল", 23.1725, 89.5126), d("satkhira", "Satkhira", "সাতক্ষীরা", 22.7185, 89.0705),
  // Barishal
  d("barishal", "Barishal", "বরিশাল", 22.701, 90.3535), d("barguna", "Barguna", "বরগুনা", 22.159, 90.1121),
  d("bhola", "Bhola", "ভোলা", 22.6859, 90.6482), d("jhalokati", "Jhalokati", "ঝালকাঠি", 22.6406, 90.1987),
  d("patuakhali", "Patuakhali", "পটুয়াখালী", 22.3596, 90.3299), d("pirojpur", "Pirojpur", "পিরোজপুর", 22.5841, 89.972),
  // Sylhet
  d("sylhet", "Sylhet", "সিলেট", 24.8949, 91.8687), d("habiganj", "Habiganj", "হবিগঞ্জ", 24.3745, 91.4155),
  d("moulvibazar", "Moulvibazar", "মৌলভীবাজার", 24.4829, 91.7774), d("sunamganj", "Sunamganj", "সুনামগঞ্জ", 25.0715, 91.395),
  // Rangpur
  d("rangpur", "Rangpur", "রংপুর", 25.7439, 89.2752), d("dinajpur", "Dinajpur", "দিনাজপুর", 25.6217, 88.6354),
  d("gaibandha", "Gaibandha", "গাইবান্ধা", 25.3297, 89.543), d("kurigram", "Kurigram", "কুড়িগ্রাম", 25.8054, 89.6361),
  d("lalmonirhat", "Lalmonirhat", "লালমনিরহাট", 25.9923, 89.2847), d("nilphamari", "Nilphamari", "নীলফামারী", 25.9318, 88.856),
  d("panchagarh", "Panchagarh", "পঞ্চগড়", 26.3411, 88.5542), d("thakurgaon", "Thakurgaon", "ঠাকুরগাঁও", 26.0337, 88.4616),
  // Mymensingh
  d("mymensingh", "Mymensingh", "ময়মনসিংহ", 24.7471, 90.4203), d("jamalpur", "Jamalpur", "জামালপুর", 24.9375, 89.9372),
  d("netrokona", "Netrokona", "নেত্রকোণা", 24.8709, 90.7279), d("sherpur", "Sherpur", "শেরপুর", 25.0204, 90.0153),
];

export const districtById = (id: unknown): District | undefined => DISTRICTS.find((x) => x.id === String(id ?? "").toLowerCase());

/** Cookie / storage format for a buyer's chosen location: "lat,lng". Rounded to ~110 m so nothing precise is kept. */
export function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** The district whose centre is closest to a point (used to label a pin when the seller did not pick a district). */
export function nearestDistrict(c: Coords): District {
  let best = DISTRICTS[0];
  let bestKm = Infinity;
  for (const x of DISTRICTS) {
    const km = haversineKm(c, x);
    if (km < bestKm) { best = x; bestKm = km; }
  }
  return best;
}

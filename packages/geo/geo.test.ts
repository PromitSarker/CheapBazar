import { test } from "node:test";
import assert from "node:assert/strict";
import { DISTRICTS, parseCoords, haversineKm, nearestDistrict, districtById, BD_BOUNDS } from "./index";

test("64 districts, unique ids, every centre is inside Bangladesh", () => {
  assert.equal(DISTRICTS.length, 64);
  assert.equal(new Set(DISTRICTS.map((d) => d.id)).size, 64);
  for (const d of DISTRICTS) assert.ok(parseCoords(d.lat, d.lng), `${d.id} is outside the bounds`);
  assert.ok(DISTRICTS.every((d) => d.en && d.bn));
});

test("parseCoords accepts numbers and numeric strings, rejects junk, swapped and foreign points", () => {
  assert.deepEqual(parseCoords("23.8103", "90.4125"), { lat: 23.8103, lng: 90.4125 });
  for (const [a, b] of [[null, 90], [23, ""], ["x", "y"], [90.41, 23.78], [51.5, -0.12], [0, 0], [NaN, 90], [BD_BOUNDS.maxLat + 0.1, 90]]) {
    assert.equal(parseCoords(a, b), null, `${a},${b}`);
  }
});

test("haversine: Dhaka to Chattogram is about 215 km, and a point to itself is 0", () => {
  const dhaka = districtById("dhaka")!, ctg = districtById("chattogram")!;
  const km = haversineKm(dhaka, ctg);
  assert.ok(km > 205 && km < 225, String(km));
  assert.equal(haversineKm(dhaka, dhaka), 0);
  assert.equal(nearestDistrict({ lat: 22.36, lng: 91.78 }).id, "chattogram");
  assert.equal(districtById("ATLANTIS"), undefined);
});

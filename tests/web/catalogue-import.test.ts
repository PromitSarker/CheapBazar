import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, csvCell } from "../../src/lib/catalogue/csv";
import { readRows, validateRow, validateAll, matchCategory, templateCsv, MAX_ROWS, type CategoryChoice } from "../../src/lib/catalogue/import";

const sub = (id: string, nameEn: string, nameBn = ""): CategoryChoice => ({ id, nameEn, nameBn, slug: id, children: [] });
const tree: CategoryChoice[] = [
  { id: "food", nameEn: "Grocery & Food", nameBn: "মুদি ও খাবার", slug: "grocery-food", children: [sub("fruit", "Fruits & Vegetables", "ফল ও সবজি"), sub("bakery", "Bakery & Snacks")] },
  { id: "fashion", nameEn: "Fashion", nameBn: "ফ্যাশন", slug: "fashion", children: [sub("men", "Men", "পুরুষ"), sub("kids", "Kids")] },
  { id: "baby", nameEn: "Baby & Kids", nameBn: "", slug: "baby-kids", children: [sub("kids2", "Kids")] },
];

test("csv: quotes, escaped quotes, commas and newlines in fields, CRLF, BOM, blank lines", () => {
  const text = '﻿name,price,description\r\n"Apple, red",80,"He said ""fresh""\nand sweet"\r\n\r\nPear,60,\r\n';
  assert.deepEqual(parseCsv(text), [["name", "price", "description"], ["Apple, red", "80", 'He said "fresh"\nand sweet'], ["Pear", "60", ""]]);
  assert.deepEqual(parseCsv("a,b"), [["a", "b"]], "no trailing newline");
  assert.throws(() => parseCsv('a,"unterminated'), /never closed/);
  assert.equal(csvCell('x,"y"'), '"x,""y"""');
  assert.deepEqual(parseCsv(templateCsv())[0][0], "name", "the template round-trips through the parser");
});

test("rows: header aliases, required columns, limits", () => {
  const rows = readRows("Product Name,Selling Price,Qty,MRP,Image\nApple,80,5,100,https://x.test/a.jpg\n");
  assert.deepEqual(rows[0], { line: 2, name: "Apple", price: "80", stock: "5", original_price: "100", image_url: "https://x.test/a.jpg" });
  assert.throws(() => readRows("name,stock\nA,1"), /"price" column/);
  assert.throws(() => readRows("name,price\n"), /no products/);
  assert.throws(() => readRows(""), /empty/);
  const many = "name,price\n" + Array.from({ length: MAX_ROWS + 1 }, (_, i) => `P${i},1`).join("\n");
  assert.throws(() => readRows(many), /Too many rows/);
});

test("category matching: sub-category, qualified path, department, Bangla, slug, ambiguity", () => {
  assert.deepEqual(matchCategory(tree, "fruits and vegetables"), { id: "fruit", label: "Grocery & Food › Fruits & Vegetables" }, "case and & vs and");
  assert.deepEqual(matchCategory(tree, "Fashion > Men"), { id: "men", label: "Fashion › Men" });
  assert.deepEqual(matchCategory(tree, "fashion/men"), { id: "men", label: "Fashion › Men" });
  assert.deepEqual(matchCategory(tree, "ফল ও সবজি"), { id: "fruit", label: "Grocery & Food › Fruits & Vegetables" }, "Bangla name");
  assert.deepEqual(matchCategory(tree, "bakery-snacks").hasOwnProperty("error"), true, "a slug that is not a slug of the sub is unknown");
  assert.deepEqual(matchCategory(tree, "Fashion"), { id: "fashion", label: "Fashion" }, "a department is allowed");
  const amb = matchCategory(tree, "Kids") as { error: string };
  assert.match(amb.error, /several departments/);
  assert.deepEqual(matchCategory(tree, "Baby & Kids > Kids"), { id: "kids2", label: "Baby & Kids › Kids" }, "qualifying fixes it");
  assert.match((matchCategory(tree, "Flying Cars") as any).error, /unknown category/);
  assert.match((matchCategory(tree, "  ") as any).error, /required/);
});

test("row validation: good row, every kind of bad row, and normalisation", () => {
  const ok = validateRow({ line: 2, name: " Red Apple ", price: "৳1,250.50", stock: "5", category: "Fruits & Vegetables", brand: "Orchard", unit: "1 kg", original_price: "1,500", image_url: "https://x.test/a.jpg", description: "d" }, tree);
  assert.equal(ok.ok, true, ok.errors.join("; "));
  assert.deepEqual(ok.payload, { name: "Red Apple", price: 1250.5, stock: 5, categoryId: "fruit", brand: "Orchard", unit: "1 kg", compareAtPrice: 1500, description: "d", image: "https://x.test/a.jpg" });

  assert.equal(validateRow({ line: 2, name: "A", price: "10", category: "Men" }, tree).payload!.stock, 10, "stock defaults to 10");

  const bad = (o: any) => validateRow({ line: 2, name: "A", price: "10", category: "Men", ...o }, tree);
  assert.match(bad({ name: "" }).errors[0], /name is required/);
  assert.match(bad({ name: "x".repeat(141) }).errors[0], /140/);
  for (const price of ["0", "-5", "abc", "99999999"]) assert.match(bad({ price }).errors[0], /price must be/, price);
  for (const stock of ["1.5", "-1", "x"]) assert.match(bad({ stock }).errors[0], /stock must be/, stock);
  assert.match(bad({ category: "" }).errors[0], /category is required/);
  assert.match(bad({ category: "Nope" }).errors[0], /unknown category/);
  assert.match(bad({ original_price: "10" }).errors[0], /higher than price/);
  assert.match(bad({ original_price: "5" }).errors[0], /higher than price/);
  assert.match(bad({ image_url: "javascript:alert(1)" }).errors[0], /https/);
  assert.match(bad({ image_url: "http://insecure.test/a.jpg" }).errors[0], /https/);
  assert.equal(bad({ image_url: "/uploads/abc.png" }).ok, true);
  assert.match(bad({ brand: "b".repeat(61) }).errors[0], /brand/);
  const multi = bad({ name: "", price: "x", category: "Nope" });
  assert.equal(multi.errors.length, 3, "all problems in a row are reported together");
});

test("validateAll keeps line numbers so errors point at the spreadsheet row", () => {
  const rows = readRows("name,price,category\nGood,10,Men\nBad,abc,Men\n,5,Men\n");
  const res = validateAll(rows, tree);
  assert.deepEqual(res.map((r) => [r.line, r.ok]), [[2, true], [3, false], [4, false]]);
});

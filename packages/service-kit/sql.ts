/** Split a SQL script into statements, respecting $$ ... $$ bodies and -- comments. */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inDollar = false;
  const lines = sql.split("\n").filter((l) => !l.trim().startsWith("--"));
  const text = lines.join("\n");
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith("$$", i)) {
      inDollar = !inDollar;
      cur += "$$";
      i++;
      continue;
    }
    const ch = text[i];
    if (ch === ";" && !inDollar) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseLegacyBlock(block: string): unknown {
  const lines = block
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  let type = "PG",
    points = 1,
    required = true,
    rubric = "",
    minChars = 0,
    explanation = "";
  let keywords: string[] = [];
  const body: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const m = line.match(
      /^(Tipe|Type|Bobot|Poin|Points|Wajib|Rubrik|MinKarakter|KataKunci|Pembahasan)\s*:\s*(.*)$/i,
    );
    if (!m) {
      body.push(line);
      continue;
    }
    const attr = m[1].toLowerCase();
    if (seen.has(attr)) throw Error("Atribut berulang: " + m[1]);
    seen.add(attr);
    const val = m[2].trim();
    switch (attr) {
      case "tipe":
      case "type":
        type = val.toUpperCase() === "ESAI" ? "Esai" : val.toUpperCase();
        break;
      case "bobot":
      case "poin":
      case "points":
        points = Number(val);
        break;
      case "wajib":
        if (!/^(true|false|ya|tidak|1|0)$/i.test(val))
          throw Error("Wajib harus true/false atau ya/tidak.");
        required = /^(true|ya|1)$/i.test(val);
        break;
      case "rubrik":
        rubric = val;
        break;
      case "minkarakter":
        minChars = Number(val);
        break;
      case "katakunci":
        keywords = val
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "pembahasan":
        explanation = val;
    }
  }
  const options: { id: string; text: string }[] = [];
  const key: string[] = [];
  const stem: string[] = [];
  const distractors: string[] = [];
  let section = "stem";
  let hasKey = false;
  for (const line of body) {
    let m: RegExpMatchArray | null;
    if (/^Pernyataan\s*:/i.test(line)) {
      section = "bs";
      continue;
    }
    if (/^Pasangan\s*:/i.test(line)) {
      section = "pairs";
      continue;
    }
    if (/^Peng[ea]coh\s*:/i.test(line)) {
      section = "distractors";
      continue;
    }
    if (
      (type === "PG" || type === "PG_KOMPLEKS") &&
      (m = line.match(/^(?:Kunci|Jawaban|Jawab|Answer)\s*:\s*(.+)$/i))
    ) {
      if (hasKey) throw Error("Kunci berulang.");
      hasKey = true;
      key.push(...m[1].split(/[,;|]/).map((s) => s.trim()));
    } else if (
      (type === "PG" || type === "PG_KOMPLEKS") &&
      (m = line.match(/^([A-F])[.)]\s*(.+)$/i))
    )
      options.push({ id: m[1].toUpperCase(), text: m[2] });
    else if (type === "BS" && section === "bs") {
      m = line.match(/^(.+?)\s*\|\s*(.+)$/);
      if (!m) throw Error("Pernyataan BS harus teks | Benar/Salah.");
      const k = m[2].toLowerCase();
      if (!/^(b|s|benar|salah|true|false|1|0)$/.test(k))
        throw Error("Kunci BS tidak dikenal.");
      options.push({ id: "s" + (options.length + 1), text: m[1] });
      key.push(/^(b|benar|true|1)$/.test(k) ? "true" : "false");
    } else if (type === "JODOH" && section === "pairs") {
      m = line.match(/^(.+?)\s*(?:=|→|\s-\s)\s*(.+)$/);
      if (!m) throw Error("Pasangan harus kiri = kanan.");
      options.push({ id: "s" + (options.length + 1), text: m[1] });
      key.push(m[2]);
    } else if (type === "JODOH" && section === "distractors")
      distractors.push(line);
    else stem.push(line.replace(/^(?:No\.?\s*)?\d+[.)]\s*/, ""));
  }
  return {
    type,
    stem: stem.join("\n"),
    points,
    required,
    options,
    key: key.map(
      (k) =>
        options.find((o) => o.id === k.toUpperCase())?.id ||
        options.find((o) => o.text === k)?.id ||
        k,
    ),
    rubric,
    minChars,
    keywords,
    distractors,
    explanation,
  };
}

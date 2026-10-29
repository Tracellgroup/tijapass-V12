// PDF statement text (IMP-01): runs in the browser with PDF.js, including password-protected files.
// Text items are grouped into lines by their vertical position so table rows stay together.
export async function pdfText(file, password = "") {
  const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await getDocument({ data, password: password || undefined }).promise;
  } catch (e) {
    if (e?.name === "PasswordException") {
      const err = new Error(password ? "wrong-password" : "needs-password");
      err.code = err.message;
      throw err;
    }
    throw e;
  }
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: it.transform[4], s: it.str });
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => out.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join("  ")));
  }
  return out.join("\n");
}

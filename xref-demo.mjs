// Pitfall 1: an incremental update whose cross-reference form differs from the original's last section.
// Writes out/xref-{table,stream}-update-over-table.pdf; render them with PDFKit and with poppler to compare.
import { writeFileSync } from 'node:fs';
import { PDFDocument, PDFName, StandardFonts, pushGraphicsState, popGraphicsState, setGraphicsState, setFillingRgbColor, rectangle, fill } from '@cantoo/pdf-lib';

// 1) The original: a one-page PDF saved with a classic `xref` table (no object streams).
const base = await PDFDocument.create();
const page = base.addPage([420, 160]);
const helvetica = await base.embedFont(StandardFonts.Helvetica);
page.drawText('This sentence should stay readable under the highlight.', { x: 20, y: 80, size: 14, font: helvetica });
const originals = {
  table: await base.save({ useObjectStreams: false }), // last section: a classic `xref` table
  stream: await base.save({ useObjectStreams: true }), // last section: an XRef stream (PDF 1.5+)
};
writeFileSync('out/original-table.pdf', originals.table);
writeFileSync('out/original-stream.pdf', originals.stream);

// 2) An incremental update that adds a translucent highlighter stroke (opacity 0.6, Multiply blend).
async function highlight(original, useObjectStreams) {
  const doc = await PDFDocument.load(original, { forIncrementalUpdate: true });
  const page = doc.getPage(0);
  // The highlighter's transparency lives in an ExtGState dictionary. As its own (indirect) object it is one of the
  // non-stream objects a writer may pack into an object stream (/Type /ObjStm) when object streams are on.
  const gs = doc.context.register(doc.context.obj({ Type: 'ExtGState', ca: 0.6, CA: 0.6, BM: 'Multiply' }));
  page.node.setExtGState(PDFName.of('GSHL'), gs);
  page.pushOperators(pushGraphicsState(), setGraphicsState('GSHL'), setFillingRgbColor(1, 0.85, 0), rectangle(16, 74, 390, 24), fill(), popGraphicsState());
  return doc.save({ useObjectStreams }); // the original bytes followed by the appended update
}

const cases = [
  ['table-update-over-table', 'table', false],
  ['stream-update-over-table', 'table', true],
  ['table-update-over-stream', 'stream', false],
  ['stream-update-over-stream', 'stream', true],
];
for (const [name, originalForm, useObjectStreams] of cases) {
  const original = originals[originalForm];
  const bytes = await highlight(original, useObjectStreams);
  writeFileSync(`out/xref-${name}.pdf`, bytes);
  const tail = Buffer.from(bytes.subarray(original.length)).toString('latin1');
  console.log(name.padEnd(26), '| original kept:', Buffer.from(bytes.subarray(0, original.length)).equals(Buffer.from(original)),
    '| update XRef stream:', /\/Type\s*\/XRef/.test(tail), '| update ObjStm:', /\/Type\s*\/ObjStm/.test(tail), '| update xref table:', /\nxref\s/.test(tail));
}

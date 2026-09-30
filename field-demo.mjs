// Pitfall 2: PDFKit draws a filled text field's value itself (CoreText, from /V and /DA) and drops the
// text-showing operators of the field's appearance stream, but it still paints everything else in it.
// An appearance that draws the value as glyph outlines (paths) therefore shows up twice in Preview.
// Writes out/field-{text,outline,type3}.pdf.
import { readFileSync, writeFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, StandardFonts } from '@cantoo/pdf-lib';

const VALUE = 'Jane Doe';
const FONT_PATH = process.argv[2] || '/System/Library/Fonts/Supplemental/Georgia.ttf'; // a serif, so the two layers differ
const outlineFont = fontkit.create(readFileSync(FONT_PATH));
const SIZE = 16, W = 300, H = 36, PAD = 6, BASELINE = 12;

// A glyph's path (font units) as PDF path operators, placed at (dx, dy) and scaled by s; quadratic curves become cubic.
function pathOps(path, dx, dy, s) {
  const out = [];
  let cx = 0, cy = 0;
  const p = (x, y) => `${(dx + x * s).toFixed(3)} ${(dy + y * s).toFixed(3)}`;
  for (const { command, args } of path.commands) {
    if (command === 'moveTo') { out.push(`${p(args[0], args[1])} m`); [cx, cy] = args; }
    else if (command === 'lineTo') { out.push(`${p(args[0], args[1])} l`); [cx, cy] = args; }
    else if (command === 'quadraticCurveTo') {
      const [qx, qy, x, y] = args;
      out.push(`${p(cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy))} ${p(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y))} ${p(x, y)} c`);
      [cx, cy] = [x, y];
    } else if (command === 'bezierCurveTo') { out.push(`${p(args[0], args[1])} ${p(args[2], args[3])} ${p(args[4], args[5])} c`); [cx, cy] = [args[4], args[5]]; }
    else if (command === 'closePath') out.push('h');
  }
  return out;
}

async function build(kind) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 120]);
  page.drawText('Name:', { x: 20, y: 58, size: 14, font: await doc.embedFont(StandardFonts.Helvetica) });
  const field = doc.getForm().createTextField('name');
  field.addToPage(page, { x: 80, y: 46, width: W, height: H, borderWidth: 1 });
  field.setText(VALUE); // the value, /V; /DA names Helvetica
  if (kind === 'text') return doc.save(); // pdf-lib's own appearance: the value in Helvetica, as BT … Tj … ET

  const run = outlineFont.layout(VALUE);
  const scale = SIZE / outlineFont.unitsPerEm;
  let ops, resources;
  if (kind === 'outline') {
    // The value as filled glyph outlines: what a writer with its own text engine (shaping, fallback fonts) may emit.
    ops = ['/Tx BMC', 'q', '0 g'];
    let x = PAD;
    run.glyphs.forEach((glyph, i) => { ops.push(...pathOps(glyph.path, x, BASELINE, scale)); x += run.positions[i].xAdvance * scale; });
    ops.push('f', 'Q', 'EMC');
    resources = {};
  } else {
    // The fix: the same outlines as the glyph procedures of a Type 3 font, shown with Tj. PDFKit drops the text
    // operators and draws the value once; every other reader draws the Type 3 glyphs.
    const charProcs = {}, differences = [1], widths = [];
    run.glyphs.forEach((glyph, i) => {
      const name = `g${i + 1}`;
      const proc = doc.context.stream([`${run.positions[i].xAdvance} 0 d0`, ...pathOps(glyph.path, 0, 0, 1), 'f'].join('\n'));
      charProcs[name] = doc.context.register(proc);
      differences.push(PDFName.of(name));
      widths.push(run.positions[i].xAdvance);
    });
    const upem = outlineFont.unitsPerEm;
    const type3 = doc.context.register(doc.context.obj({
      Type: 'Font', Subtype: 'Type3', FontBBox: [0, -upem, 2 * upem, 2 * upem], FontMatrix: [1 / upem, 0, 0, 1 / upem, 0, 0],
      CharProcs: charProcs, Encoding: { Type: 'Encoding', Differences: differences },
      FirstChar: 1, LastChar: run.glyphs.length, Widths: widths, Resources: {},
    }));
    const codes = run.glyphs.map((_, i) => (i + 1).toString(16).padStart(2, '0')).join('');
    ops = ['/Tx BMC', 'q', '0 g', 'BT', `/F3 ${SIZE} Tf`, `${PAD} ${BASELINE} Td`, `<${codes}> Tj`, 'ET', 'Q', 'EMC'];
    resources = { Font: { F3: type3 } };
  }
  const appearance = doc.context.stream(ops.join('\n'), { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, W, H], Resources: resources });
  field.acroField.getWidgets()[0].setNormalAppearance(doc.context.register(appearance));
  return doc.save({ updateFieldAppearances: false }); // keep our appearance; pdf-lib must not redraw it
}

for (const kind of ['text', 'outline', 'type3']) {
  const bytes = await build(kind);
  writeFileSync(`out/field-${kind}.pdf`, bytes);
  console.log(kind.padEnd(8), bytes.length, 'bytes');
}

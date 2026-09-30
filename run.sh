#!/bin/sh
# Build the PDFs, render each with Apple PDFKit (errors shown) and with poppler, side by side in out/.
set -e
cd "$(dirname "$0")"
mkdir -p out
[ -x render-pdfkit ] || swiftc -O render-pdfkit.swift -o render-pdfkit
node xref-demo.mjs
node field-demo.mjs
for pdf in out/*.pdf; do
  name=$(basename "$pdf" .pdf)
  case "$name" in original-*) continue ;; esac
  printf '%-34s PDFKit: ' "$name"
  CG_PDF_VERBOSE=1 ./render-pdfkit "$pdf" "out/$name.pdfkit.png" 2 2>&1 | grep -v '^rendered' | tr '\n' ' '
  echo
  if command -v pdftoppm >/dev/null; then pdftoppm -png -r 144 -singlefile "$pdf" "out/$name.poppler"; fi
done

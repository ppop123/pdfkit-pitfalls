// Render page 1 of a PDF with Apple's PDFKit (the engine behind Preview, the iOS Files app and Safari).
// Run with CG_PDF_VERBOSE=1 to see CoreGraphics' parser complaints on stderr.
// usage: ./render-pdfkit in.pdf out.png [scale]
import AppKit
import Foundation
import PDFKit

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: render-pdfkit in.pdf out.png [scale]"); exit(2) }
guard let doc = PDFDocument(url: URL(fileURLWithPath: args[1])), let page = doc.page(at: 0) else { print("cannot open"); exit(1) }
let scale = CGFloat(args.count > 3 ? Double(args[3]) ?? 2 : 2)
let box = page.bounds(for: .mediaBox)
let w = Int(box.width * scale), h = Int(box.height * scale)
guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                          space: CGColorSpaceCreateDeviceRGB(),
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { exit(1) }
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
ctx.scaleBy(x: scale, y: scale)
page.draw(with: .mediaBox, to: ctx) // draws annotations (form widgets included) too
guard let image = ctx.makeImage(),
      let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else { exit(1) }
try png.write(to: URL(fileURLWithPath: args[2]))
print("rendered \(w)x\(h)")

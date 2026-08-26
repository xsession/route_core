# Browser demo

The demo is dependency-free and imports the compiled ES module directly.

```bash
npm run build
python3 -m http.server 8080
```

Open `http://localhost:8080/examples/browser/`.

The demo exercises component drag previews, smart alignment guides, port-to-port wiring, wire-segment manipulation, label dragging, window/crossing selection, zoom/pan, undo/redo, dynamic pin editing, component rotation, color patterns, bend radii, route reset, validation feedback, and light/dark SVG rendering. It makes no network requests after the page is loaded.

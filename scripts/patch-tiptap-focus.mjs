// 修复 @tiptap/extensions 中多个扩展的 bug
// 这些扩展在 decorations prop 中访问 editor.isEditable，
// 但在 editor 初始化阶段 this.editor 可能为 undefined，导致崩溃
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const patches = [
  {
    name: "Focus decorations",
    file: "node_modules/@tiptap/extensions/dist/index.js",
    old: `decorations: ({ doc, selection }) => {
            const { isEditable, isFocused } = this.editor;`,
    new: `decorations: ({ doc, selection }) => {
            if (!this.editor) {
              return { empty: true };
            }
            const { isEditable, isFocused } = this.editor;`,
  },
  {
    name: "Placeholder buildPlaceholderDecorations",
    file: "node_modules/@tiptap/extensions/dist/index.js",
    old: `var _a, _b;
  const active = editor.isEditable || !options.showOnlyWhenEditable;`,
    new: `var _a, _b;
  if (!editor) {
    return null;
  }
  const active = editor.isEditable || !options.showOnlyWhenEditable;`,
  },
  {
    name: "Selection decorations",
    file: "node_modules/@tiptap/extensions/dist/index.js",
    old: `decorations(state) {
            if (state.selection.empty || editor.isFocused || !editor.isEditable || isNodeSelection(state.selection) || editor.view.dragging) {`,
    new: `decorations(state) {
            if (!editor || state.selection.empty || editor.isFocused || !editor.isEditable || isNodeSelection(state.selection) || editor.view.dragging) {`,
  },
];

let patched = 0;
for (const p of patches) {
  const filePath = resolve(p.file);
  if (!existsSync(filePath)) {
    console.log(`[patch] ${p.name}: file not found, skipping`);
    continue;
  }
  const content = readFileSync(filePath, "utf8");
  if (content.includes(p.new)) {
    console.log(`[patch] ${p.name}: already patched`);
    continue;
  }
  if (content.includes(p.old)) {
    writeFileSync(filePath, content.replace(p.old, p.new));
    console.log(`[patch] ${p.name}: patched`);
    patched++;
  } else {
    console.log(`[patch] ${p.name}: target not found, may need update`);
  }
}
console.log(`[patch] Done. ${patched} patches applied.`);

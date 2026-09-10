---
title: Math Formulas
tags: [editor]
---

# Math Formulas

Tydora renders math with **KaTeX**, and you can write LaTeX formulas inline or as a block.

> [!NOTE]
> Formula rendering is on by default. Tydora uses **KaTeX only** — there is no MathJax engine to switch to.

## Inline Formulas

Wrap the formula in single dollar signs `$ ... $`:

```markdown
The mass–energy relation $E=mc^2$ is fundamental to physics.
```

Rendered: The mass–energy relation $E=mc^2$ is fundamental to physics.

## Block Formulas

Wrap the formula in double dollar signs `$$ ... $$` and it takes its own centered line:

```markdown
$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$
```

## The Formula Dialog

In live preview mode, **click a rendered formula** to open the formula dialog and preview as you type:

- Typing LaTeX shows the rendered result immediately in the dialog
- Syntax errors are reported without affecting the document
- You can also open a blank dialog via the right-click menu "Insert" → "Formula Block", then confirm to insert a block formula

> For complex formulas, prefer the dialog over hand-writing — the preview catches unbalanced braces immediately.

## Common Syntax

### Superscripts and Subscripts

```markdown
$x^2$        → superscript
$H_2O$       → subscript
$x_i^{2n}$   → combined
```

### Fractions

```markdown
$\frac{a}{b}$
```

### Roots

```markdown
$\sqrt{x}$       → square root
$\sqrt[n]{x}$    → nth root
```

### Sums, Integrals, and Products

```markdown
$\sum_{i=1}^{n}$   → summation
$\int_{a}^{b}$     → integral
$\prod_{i=1}^{n}$  → product
```

### Greek Letters

```markdown
$\alpha$ $\beta$ $\gamma$ $\delta$
$\pi$ $\sigma$ $\omega$ $\theta$
```

### Matrices

```markdown
$$
\begin{bmatrix}
1 & 2 \\
3 & 4
\end{bmatrix}
$$
```

### Multi-line Alignment

```markdown
$$
\begin{aligned}
a &= b + c \\
  &= d + e
\end{aligned}
$$
```

## Troubleshooting

- Inline formulas must be written as `$...$`; block formulas as `$$...$$` on their own lines
- Wrap multi-character subscripts in braces: `$x_{ij}$`, not `$x_ij$`
- Don't omit backslash commands such as `\frac` and `\sum`
- If a formula errors under KaTeX, it likely uses macros from a package KaTeX doesn't implement — rewrite it with equivalent basic syntax

> [!TIP]
> Markdown superscript / subscript syntax (`X^2^`, `H~2~O`) does **not** render in Tydora. For math, always use formula syntax.

## Related Documents

- [[02-Editor/02-Markdown-Syntax]] — Basic syntax
- [[02-Editor/03-Code-Blocks]] — Code highlighting
- [[02-Editor/05-Mermaid-Diagrams]] — Diagram syntax

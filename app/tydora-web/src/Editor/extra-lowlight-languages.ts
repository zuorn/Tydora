// src/Editor/extra-lowlight-languages.ts
// 将 14 种非 common 内置的 lowlight 语言定义移入此独立模块，
// 供 TipTapEditor 在首帧渲染后动态 import 注册，避免启动时同步加载。
//
// 原实现：TipTapEditor.tsx 顶层 static import 14 个语言 + 模块作用域 register，
//         这些语言定义（vim/haskell/julia 等）在 App chunk 加载时就被解析。
// 新实现：此模块被 dynamic import，14 个语言定义进入单独 chunk，首帧后加载。

import type { createLowlight } from "lowlight";
import vimLang from "highlight.js/lib/languages/vim";
import dockerfileLang from "highlight.js/lib/languages/dockerfile";
import powershellLang from "highlight.js/lib/languages/powershell";
import latexLang from "highlight.js/lib/languages/latex";
import nginxLang from "highlight.js/lib/languages/nginx";
import cmakeLang from "highlight.js/lib/languages/cmake";
import scalaLang from "highlight.js/lib/languages/scala";
import haskellLang from "highlight.js/lib/languages/haskell";
import elixirLang from "highlight.js/lib/languages/elixir";
import juliaLang from "highlight.js/lib/languages/julia";
import tclLang from "highlight.js/lib/languages/tcl";
import propertiesLang from "highlight.js/lib/languages/properties";
import gradleLang from "highlight.js/lib/languages/gradle";
import { mermaidHljsLang } from "./extensions/mermaid-language";

/** 注册额外的 lowlight 语言（非 common 内置的）。 */
export function registerExtraLanguages(lowlight: ReturnType<typeof createLowlight>): void {
  lowlight.register("vim", vimLang);
  lowlight.register("dockerfile", dockerfileLang);
  lowlight.register("powershell", powershellLang);
  lowlight.register("latex", latexLang);
  lowlight.register("nginx", nginxLang);
  lowlight.register("cmake", cmakeLang);
  lowlight.register("scala", scalaLang);
  lowlight.register("haskell", haskellLang);
  lowlight.register("elixir", elixirLang);
  lowlight.register("julia", juliaLang);
  lowlight.register("tcl", tclLang);
  lowlight.register("properties", propertiesLang);
  lowlight.register("gradle", gradleLang);
  lowlight.register("mermaid", mermaidHljsLang);
}

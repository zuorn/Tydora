/* =================================================================
 * Tydora Official Website — Client Script (Terax-inspired)
 * Vanilla JS: i18n, scroll animations, mobile menu, navbar, FAQ.
 * ================================================================= */
(function () {
  'use strict';

  /* ========== i18n Translations ========== */
  const i18n = {
    cn: {
      // Nav
      'nav.features': '功能',
      'nav.themes': '主题',
      'nav.toolkit': '更多',
      'nav.download': '下载',
      // Hero
      'hero.overline': '一款现代化的 Markdown 桌面编辑器',
      'hero.title': '指尖上的<span class="text-gradient">礼物</span>',
      'hero.desc': '基于 Tauri + Vditor 构建的沉浸式写作工具。<br/>致敬 Typora，将所见即所得的体验化作一份礼物。',
      'hero.ctaDownload': 'Download for Windows',
      'hero.ctaGithub': 'GitHub',
      'hero.metaFree': '完全免费',
      'hero.metaFreeLabel': 'Free Forever',
      'hero.metaOss': 'MIT 开源',
      'hero.metaOssLabel': 'Open Source',
      'hero.metaWin': 'Windows 10+',
      'hero.metaWinLabel': 'Platform',
      'hero.metaSize': '< 20 MB',
      'hero.metaSizeLabel': 'App Size',

      // Hero app mock (faux editor window)
      'mock.title': 'Tydora — 灵感.md',
      'mock.sb.folder1': '📁 我的笔记',
      'mock.sb.file1': '📄 灵感.md',
      'mock.sb.file2': '📄 草稿.md',
      'mock.sb.file3': '📄 TODO.md',
      'mock.sb.folder2': '📁 项目',
      'mock.sb.file4': '📄 设计稿.md',
      'mock.sb.file5': '📄 周报.md',
      'mock.editor.h1': '# 灵感',
      'mock.editor.p1': '在这里开始你的<strong>写作</strong>...',
      'mock.editor.h2': '## 想法',
      'mock.editor.li1': '用 <em>Markdown</em> 让结构清晰',
      'mock.editor.li2': '让 <code>代码</code> 优雅',
      'mock.editor.quote': '"工具不应成为思考的阻碍。"',

      // Feature 01 — Editor
      'f1.heading': '编辑器',
      'f1.subheading': '你真正想住进去的编辑器。',
      'f1.desc': '基于 Vditor 3.x 引擎，支持三种编辑模式——所见即所得（WYSIWYG）、即时渲染（IR）和分屏预览（SV）。内置数学公式、代码高亮、打字机模式、实时大纲与字数统计。所思即所写，无干扰写作。',
      'f1.l1': '三模式切换 — WYSIWYG / IR / SV，一键无缝切换',
      'f1.l2': '数学公式 — KaTeX 与 MathJax 双引擎支持',
      'f1.l3': '代码高亮 — 多款主题，行号显示，开发者友好',
      'f1.l4': '打字机模式 + 实时大纲 + 字数统计',
      'f1.caption': 'editor · mint theme · 文件树 + 编辑区',

      // Feature 02 — Command Palette
      'f2.heading': '命令面板',
      'f2.subheading': 'Ctrl+P 唤出，模糊搜索一切。',
      'f2.desc': '强大的命令面板覆盖所有操作：编辑命令（撤销重做、格式化）、格式命令（加粗斜体、标题级别）、视图命令（模式切换、思维导图）、文件命令（新建保存关闭），以及菜单命令、插件命令和快捷键速查。最近使用智能排序，所想即可达。',
      'f2.l1': 'Ctrl+P 模糊搜索全部命令',
      'f2.l2': 'Ctrl+O 快速打开仓库内任意文件',
      'f2.l3': '最近使用智能排序 + 最近命令记忆',
      'f2.l4': '支持自定义快捷键绑定',
      'f2.caption': 'command palette mindmap · 全部命令一目了然',

      // Feature 03 — Knowledge Graph
      'f3.heading': '知识图谱',
      'f3.subheading': '让笔记互联成网。',
      'f3.desc': '基于 Markmap 的思维导图视图，以可视化方式呈现文档结构。独立窗口自由缩放层级，让结构化思考一目了然。配合即将推出的双链（Wiki链接）与反向链接功能，构建你的个人知识网络。',
      'f3.l1': 'Ctrl+M 一键生成 markmap 思维导图',
      'f3.l2': '独立窗口，自由缩放，层级清晰',
      'f3.l3': '知识图谱 — 可视化节点关系网络',
      'f3.l4': '双链 / 反向链接 — 笔记互联成网（开发中）',
      'f3.caption': 'knowledge graph · 知识图谱节点网络',

      // Feature 04 — Themes
      'f4.heading': '主题系统',
      'f4.subheading': '从清新薄荷到深沉暗色，匹配你的每一次心境。',
      'f4.desc': '5 款精心打磨的内置主题：Catppuccin Mocha、White、Mint、Mint Dark 和 Liquid Glass（苹果风毛玻璃）。同时兼容导入 Typora 主题 CSS 文件，所见即所爱。编辑器主题可独立于应用外观设置。',
      'f4.defaultTag': '默认',

      // Toolkit
      'tk.title': '更多能力，无需插件。',
      'tk.subtitle': '开箱即用的完整功能集合。',
      'tk.t1Title': '仓库管理',
      'tk.t1Desc': '类 Obsidian 的多文件夹仓库，文件树浏览、拖拽排序、批量操作。',
      'tk.t2Title': '多媒体预览',
      'tk.t2Desc': '图片缩放、视频、音频、PDF 预览，无须切换应用。',
      'tk.t3Title': '自定义快捷键',
      'tk.t3Desc': '所有常用操作均可通过快捷键触发，完全按你的节奏工作。',
      'tk.t4Title': '自动更新',
      'tk.t4Desc': '基于 GitHub Releases 自动检测与安装新版本。',
      'tk.t5Title': 'Typora 主题兼容',
      'tk.t5Desc': '直接导入 Typora 的 CSS 主题文件，即刻生效。',
      'tk.t6Title': '窗口状态记忆',
      'tk.t6Desc': '记住窗口位置、大小、侧边栏宽度，下次打开如初。',

      // Roadmap
      'rm.title': '路线图',
      'rm.subtitle': '这些特性正在路上。',
      'rm.badge': 'Coming Soon',
      'rm.r1Title': '双链 / 维基链接',
      'rm.r1Desc': '支持 <code>[[笔记名]]</code> 语法、自动补全、反向链接面板与知识图谱，让笔记互联成网。',
      'rm.r2Title': '图片增强',
      'rm.r2Desc': '粘贴拖拽上传、图床 (SM.MS) 支持、多种存储模式、压缩裁剪与批量管理。',
      'rm.r3Title': '完整编辑器设置',
      'rm.r3Desc': '更细粒度的行为配置面板：字体选择、自动保存策略、快捷键深度定制等。',

      // Download
      'dl.version': 'Download · v0.1.0',
      'dl.title': '选一个版本开始用。',
      'dl.recommended': '推荐',
      'dl.format': 'NSIS 安装包 · 64-bit',
      'dl.cta': '下载 Tydora',
      'dl.req': 'Windows 10 或更高版本（推荐 Windows 11）',
      'dl.soon': '即将推出',
      'dl.macFormat': 'macOS 构建正在筹备中',
      'dl.macNote': '.icns 图标资源已就绪，关注 GitHub Releases。',

      // FAQ
      'faq.title': '常见问题',
      'faq.q1': 'Tydora 是免费的吗？',
      'faq.a1': '完全免费，且基于 MIT 协议开源。任何人都可以自由使用、修改并分发。',
      'faq.q2': 'Tydora 与 Typora 是什么关系？',
      'faq.a2': 'Tydora 是一个向 Typora 致敬的独立开源项目，并非官方分支或克隆。命名上保留了 "Ty" 与 "ora"，延续「指尖上的礼物」这一浪漫期许。',
      'faq.q3': '可以导入 Typora 主题吗？',
      'faq.a3': '可以。Tydora 兼容 Typora 的主题 CSS 格式，在应用设置中导入即可使用。',
      'faq.q4': '如何参与贡献？',
      'faq.a4': '欢迎在 GitHub 上提交 Issue 报告问题，或 Fork 后发起 Pull Request。每一份贡献都让 Tydora 更进一步。',

      // Footer
      'footer.tagline': '指尖上的礼物',
      'footer.github': 'GitHub',
      'footer.releases': 'Releases',
      'footer.license': 'License (MIT)',
      'footer.stack': 'Built with Tauri · React · Vditor',
      'footer.copyright': '&copy; 2026 Tydora.'
    },

    en: {
      // Nav
      'nav.features': 'Features',
      'nav.themes': 'Themes',
      'nav.toolkit': 'More',
      'nav.download': 'Download',
      // Hero
      'hero.overline': 'A modern Markdown desktop editor.',
      'hero.title': 'A Gift at Your <span class="text-gradient">Fingertips</span>',
      'hero.desc': 'An immersive writing tool built on Tauri + Vditor.<br/>A tribute to Typora — turning WYSIWYG into a gift for everyone who loves words.',
      'hero.ctaDownload': 'Download for Windows',
      'hero.ctaGithub': 'GitHub',
      'hero.metaFree': 'Free Forever',
      'hero.metaFreeLabel': 'Free Forever',
      'hero.metaOss': 'MIT Open Source',
      'hero.metaOssLabel': 'Open Source',
      'hero.metaWin': 'Windows 10+',
      'hero.metaWinLabel': 'Platform',
      'hero.metaSize': '< 20 MB',
      'hero.metaSizeLabel': 'App Size',

      // Hero app mock (faux editor window)
      'mock.title': 'Tydora — Inspiration.md',
      'mock.sb.folder1': '📁 My Notes',
      'mock.sb.file1': '📄 Inspiration.md',
      'mock.sb.file2': '📄 Drafts.md',
      'mock.sb.file3': '📄 TODO.md',
      'mock.sb.folder2': '📁 Projects',
      'mock.sb.file4': '📄 Mockups.md',
      'mock.sb.file5': '📄 Weekly.md',
      'mock.editor.h1': '# Inspiration',
      'mock.editor.p1': 'Start your <strong>writing</strong> here...',
      'mock.editor.h2': '## Ideas',
      'mock.editor.li1': 'Use <em>Markdown</em> to clarify structure',
      'mock.editor.li2': 'Make <code>code</code> elegant',
      'mock.editor.quote': '"A tool should never get in the way of thought."',

      // Feature 01 — Editor
      'f1.heading': 'Editor',
      'f1.subheading': 'An editor you\'ll actually want to live in.',
      'f1.desc': 'Powered by Vditor 3.x with three editing modes — WYSIWYG, Instant Rendering (IR), and Split View (SV). Built-in math formulas, code highlighting, typewriter mode, real-time outline & word count. What you think is what you write.',
      'f1.l1': 'Three modes — WYSIWYG / IR / SV, switch instantly',
      'f1.l2': 'Math formulas — KaTeX & MathJax dual engine support',
      'f1.l3': 'Code highlighting — multiple themes, line numbers, dev-friendly',
      'f1.l4': 'Typewriter mode + live outline + word count',
      'f1.caption': 'editor · mint theme · file tree + editor area',

      // Feature 02 — Command Palette
      'f2.heading': 'Command Palette',
      'f2.subheading': 'Press Ctrl+P. Fuzzy search everything.',
      'f2.desc': 'A powerful command palette covering all operations: edit commands (undo/redo/formatting), format commands (bold/italic/headings), view commands (mode switch/mindmap), file commands (new/save/close), plus menu commands, plugin commands and shortcut cheatsheet. Recent usage smart-sorted.',
      'f2.l1': 'Ctrl+P to fuzzy-search all commands',
      'f2.l2': 'Ctrl+O to quick-open any file in your vault',
      'f2.l3': 'Smart recent-usage sorting + recent memory',
      'f2.l4': 'Fully customizable keyboard shortcuts',
      'f2.caption': 'command palette mindmap · every command at a glance',

      // Feature 03 — Knowledge Graph
      'f3.heading': 'Knowledge Graph',
      'f3.subheading': 'Connect your notes into a web.',
      'f3.desc': 'Markmap-powered mindmap visualization of your document structure. Standalone window with free zoom levels. Combined with upcoming Wikilinks and backlinks features to build your personal knowledge network.',
      'f3.l1': 'Ctrl+M to generate a markmap mindmap instantly',
      'f3.l2': 'Standalone window, free zoom, clear hierarchy',
      'f3.l3': 'Knowledge graph — visualize node relationship network',
      'f3.l4': 'Wikilinks / Backlinks — connect notes (in development)',
      'f3.caption': 'knowledge graph · node relationship network',

      // Feature 04 — Themes
      'f4.heading': 'Themes',
      'f4.subheading': 'From fresh mint to deep dark — match your mood.',
      'f4.desc': '5 carefully crafted built-in themes: Catppuccin Mocha, White, Mint, Mint Dark, and Liquid Glass (Apple-style frosted glass). Also compatible with importing Typora theme CSS files. Editor theme can be set independently from app appearance.',
      'f4.defaultTag': 'default',

      // Toolkit
      'tk.title': 'More built in. No plugins required.',
      'tk.subtitle': 'A complete feature set, ready out of the box.',
      'tk.t1Title': 'Vault Management',
      'tk.t1Desc': 'Obsidian-like multi-folder vaults with file tree, drag-to-reorder, batch ops.',
      'tk.t2Title': 'Media Preview',
      'tk.t2Desc': 'Image zoom, video, audio, PDF preview — no context switching.',
      'tk.t3Title': 'Custom Shortcuts',
      'tk.t3Desc': 'Every common action is bound to a shortcut. Work at your rhythm.',
      'tk.t4Title': 'Auto Update',
      'tk.t4Desc': 'Powered by GitHub Releases — always stay up to date automatically.',
      'tk.t5Title': 'Typora Theme Compatible',
      'tk.t5Desc': 'Import Typora CSS themes directly — they just work.',
      'tk.t6Title': 'Window State Memory',
      'tk.t6Desc': 'Remembers position, size, sidebar width — opens exactly as you left it.',

      // Roadmap
      'rm.title': 'Roadmap',
      'rm.subtitle': 'These features are on their way.',
      'rm.badge': 'Coming Soon',
      'rm.r1Title': 'Wikilinks & Backlinks',
      'rm.r1Desc': 'Support <code>[[note name]]</code> syntax, autocomplete, backlinks panel, and knowledge graph.',
      'rm.r2Title': 'Image Enhancement',
      'rm.r2Desc': 'Paste/drag upload, image host (SM.MS), multiple storage modes, compression, cropping, and batch management.',
      'rm.r3Title': 'Full Editor Settings',
      'rm.r3Desc': 'Finer-grained settings panel: font selection, autosave strategy, advanced shortcut customization, and more.',

      // Download
      'dl.version': 'Download · v0.1.0',
      'dl.title': 'Pick a build. Get started.',
      'dl.recommended': 'Recommended',
      'dl.format': 'NSIS Installer · 64-bit',
      'dl.cta': 'Download Tydora',
      'dl.req': 'Windows 10 or later (Windows 11 recommended)',
      'dl.soon': 'Coming Soon',
      'dl.macFormat': 'macOS build is being prepared',
      'dl.macNote': '.icns icon assets are ready. Follow GitHub Releases for updates.',

      // FAQ
      'faq.title': 'FAQ',
      'faq.q1': 'Is Tydora free?',
      'faq.a1': 'Completely free, and open source under the MIT license. Anyone can freely use, modify, and distribute it.',
      'faq.q2': 'How is Tydora related to Typora?',
      'faq.a2': 'Tydora is an independent open-source project that pays tribute to Typora — not an official fork or clone. We kept "Ty" and "ora" to honor "a gift at your fingertips".',
      'faq.q3': 'Can I import Typora themes?',
      'faq.a3': 'Yes. Tydora is compatible with Typora\'s CSS theme format. Import it from the in-app settings.',
      'faq.q4': 'How can I contribute?',
      'faq.a4': 'Open an issue on GitHub or fork the repo and submit a Pull Request. Every contribution makes Tydora better.',

      // Footer
      'footer.tagline': 'A gift at your fingertips',
      'footer.github': 'GitHub',
      'footer.releases': 'Releases',
      'footer.license': 'License (MIT)',
      'footer.stack': 'Built with Tauri · React · Vditor',
      'footer.copyright': '&copy; 2026 Tydora.'
    }
  };

  /* ========== Helpers ========== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ========== Language Toggle ========== */
  function applyLanguage(lang) {
    const dict = i18n[lang];
    if (!dict) return;

    document.documentElement.lang = lang === 'cn' ? 'zh-CN' : 'en';
    document.title = lang === 'cn'
      ? 'Tydora — 指尖上的礼物 | A Gift at Your Fingertips'
      : 'Tydora — A Gift at Your Fingertips';

    const metaDesc = $('meta[name="description"]');
    if (metaDesc) metaDesc.content = lang === 'cn'
      ? 'Tydora 是一款现代的 Markdown 桌面编辑器，致敬 Typora，延续所见即所得的极简理念。'
      : 'Tydora is a modern Markdown desktop editor — a tribute to Typora.';

    $$('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (dict[key] !== undefined) el.innerHTML = dict[key];
    });

    $$('.lang-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.lang === lang);
    });

    try { localStorage.setItem('tydora-lang', lang); } catch (_) {}
  }

  function initLanguage() {
    let saved = 'cn';
    try { saved = localStorage.getItem('tydora-lang') || 'cn'; } catch (_) {}
    if (!localStorage.getItem('tydora-lang')) {
      const bl = (navigator.language || '').toLowerCase();
      if (bl.startsWith('en')) saved = 'en';
    }
    applyLanguage(saved);
    $$('.lang-option').forEach(opt => {
      opt.addEventListener('click', () => { applyLanguage(opt.dataset.lang); closeMobileMenu(); });
    });
  }

  /* ========== Mobile Menu ========== */
  function initMobileMenu() {
    const hb = $('#hamburger'), links = $('.nav-links'), overlay = $('#navOverlay');
    if (!hb || !links) return;

    hb.addEventListener('click', () => {
      const open = hb.classList.toggle('open');
      links.classList.toggle('open', open);
      hb.setAttribute('aria-expanded', String(open));
      if (overlay) overlay.classList.toggle('visible', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });

    if (overlay) overlay.addEventListener('click', closeMobileMenu);
    $$('.nav-links a').forEach(link => link.addEventListener('click', closeMobileMenu));
  }

  function closeMobileMenu() {
    const hb = $('#hamburger'), links = $('.nav-links'), overlay = $('#navOverlay');
    if (hb) { hb.classList.remove('open'); hb.setAttribute('aria-expanded', 'false'); }
    if (links) links.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  /* ========== Navbar Scroll Shadow ========== */
  function initNavbarScroll() {
    const nb = $('#navbar');
    if (!nb) return;
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => { nb.classList.toggle('scrolled', window.scrollY > 40); ticking = false; });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ========== Scroll Animations ========== */
  function initScrollAnimations() {
    if (!('IntersectionObserver' in window)) {
      $$('.animate-on-scroll').forEach(el => el.classList.add('visible'));
      return;
    }
    const reveal = el => { el.classList.add('visible'); observer.unobserve(el); };
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) reveal(e.target); }),
      { threshold: 0, rootMargin: '0px 0px 60px 0px' }
    );
    $$('.animate-on-scroll').forEach(el => observer.observe(el));

    requestAnimationFrame(() =>
      $$('.animate-on-scroll').forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight) reveal(el);
      })
    );

    let st = false;
    const onScroll = () => {
      if (st) return;
      st = true;
      requestAnimationFrame(() => {
        const vh = window.innerHeight;
        $$('.animate-on-scroll:not(.visible)').forEach(el => {
          if (el.getBoundingClientRect().top < vh + 80) reveal(el);
        });
        st = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  /* ========== Smooth Scroll ========== */
  function initSmoothScroll() {
    $$('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const href = a.getAttribute('href');
        if (!href || href === '#') return;
        const t = document.querySelector(href);
        if (!t) return;
        e.preventDefault();
        window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 60, behavior: 'smooth' });
      });
    });
  }

  /* ========== Scroll Spy ========== */
  function initScrollSpy() {
    if (!('IntersectionObserver' in window)) return;
    const secs = $$('main section[id]'), navLks = $$('.nav-links a[href^="#"]');
    if (!secs.length || !navLks.length) return;
    const map = new Map();
    navLks.forEach(lk => { const id = lk.getAttribute('href').slice(1); map.set(id, lk); });

    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLks.forEach(l => l.classList.remove('active-section'));
          const act = map.get(entry.target.id);
          if (act) act.classList.add('active-section');
        }
      });
    }, { rootMargin: '-35% 0px -50% 0px' });
    secs.forEach(s => obs.observe(s));
  }

  /* ========== Init ========== */
  function init() {
    initLanguage();
    initMobileMenu();
    initNavbarScroll();
    initScrollAnimations();
    initSmoothScroll();
    initScrollSpy();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

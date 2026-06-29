/* =================================================================
 * Tydora Official Website — Client Script
 * Vanilla JS, no dependencies. Handles i18n, scroll animations,
 * mobile menu, navbar state, and FAQ.
 * ================================================================= */
(function () {
  'use strict';

  /* ========== i18n Translations ========== */
  const i18n = {
    cn: {
      // Nav
      'nav.features': '功能',
      'nav.themes': '主题',
      'nav.preview': '预览',
      'nav.download': '下载',
      'nav.faq': 'FAQ',
      // Hero
      'hero.version': 'v0.1.0',
      'hero.title': '指尖上的礼物',
      'hero.tagline': 'A Gift at Your Fingertips',
      'hero.subtitle': '现代 Markdown 桌面编辑器 — 致敬 Typora，将沉浸式写作的体验化作一份礼物，献给每一位热爱文字的人。',
      'hero.ctaDownload': 'Download for Windows',
      'hero.ctaGithub': 'View on GitHub',
      'hero.metaFree': '完全免费',
      'hero.metaOss': '开源 MIT',
      'hero.metaWin': 'Windows 10+',
      // App mock
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
      // Features
      'features.title': '核心功能',
      'features.subtitle': '为热爱文字的人打造，每一项都围绕流畅写作体验。',
      'features.f1Title': '三模式编辑器',
      'features.f1Desc': '基于 Vditor，支持所见即所得、即时渲染、分屏预览三种模式，所思即所写。',
      'features.f2Title': '仓库管理',
      'features.f2Desc': '类 Obsidian 的多文件夹仓库，文件树浏览、新建重命名拖拽，一切井然有序。',
      'features.f3Title': '命令面板',
      'features.f3Desc': 'Ctrl+P 唤出，模糊搜索所有命令，最近使用智能排序，所想即可达。',
      'features.f4Title': '快速打开',
      'features.f4Desc': 'Ctrl+O 即可在仓库内模糊搜索任何文件，跳转只在弹指之间。',
      'features.f5Title': '思维导图',
      'features.f5Desc': 'Ctrl+M 基于 markmap，独立窗口自由缩放层级，让结构化思考一目了然。',
      'features.f6Title': '多媒体预览',
      'features.f6Desc': '内置图片缩放、视频、音频、PDF 预览，无须切换应用，专注不受打断。',
      'features.f7Title': '多主题系统',
      'features.f7Desc': '5 款精心打磨的内置主题，并兼容导入 Typora 主题文件，所见即所爱。',
      'features.f8Title': '自动更新',
      'features.f8Desc': '基于 GitHub Releases 自动检测与安装，永远用上最新版本。',
      'features.f9Title': '自定义快捷键',
      'features.f9Desc': '所有常用操作都可通过快捷键触发，按你的节奏工作。',
      'features.f10Title': '大纲与统计',
      'features.f10Desc': '实时大纲面板跳转，字数统计、打字机模式，让长文写作井然有序。',
      'features.f11Title': '数学公式',
      'features.f11Desc': '支持 KaTeX 与 MathJax 双引擎，学术写作同样优雅。',
      'features.f12Title': '代码高亮',
      'features.f12Desc': '多款高亮主题、行号显示，为开发者而生的写作体验。',
      // Themes
      'themes.title': '5 款内置主题',
      'themes.subtitle': '从清新薄荷到深沉稳重，匹配你的每一次心境。',
      // Preview
      'preview.title': '预览',
      'preview.subtitle': '距离精美截图登场还有一点点时间，敬请期待。',
      'preview.p1': '编辑器主界面',
      'preview.p2': '主题切换',
      'preview.p3': '仓库管理',
      'preview.note': '真实截图即将推出 · Real screenshots coming soon',
      // Roadmap
      'roadmap.title': '即将推出',
      'roadmap.subtitle': '这些特性正在路上，让 Tydora 一步步走向更完整的写作工具。',
      'roadmap.badge': 'Coming Soon',
      'roadmap.r1Title': '双链 / 维基链接',
      'roadmap.r1Desc': '支持 <code>[[笔记名]]</code> 语法、自动补全、反向链接面板与知识图谱，让笔记互联成网。',
      'roadmap.r2Title': '图片增强',
      'roadmap.r2Desc': '粘贴拖拽上传、图床 (SM.MS) 支持、多种存储模式、压缩裁剪与批量管理。',
      'roadmap.r3Title': '完整编辑器设置',
      'roadmap.r3Desc': '更细粒度的编辑器行为配置面板：字体、自动保存策略、快捷键深度定制等。',
      // Download
      'download.title': '下载',
      'download.subtitle': '立即开始你的 Markdown 写作之旅。',
      'download.recommended': '推荐',
      'download.soon': '即将推出',
      'download.format': 'NSIS 安装包 · 64-bit',
      'download.cta': '下载 Tydora',
      'download.req': '系统要求：Windows 10 或更高版本（推荐 Windows 11）',
      'download.macTitle': '计划中',
      'download.macFormat': 'macOS 构建正在筹备中',
      'download.macNote': '已在仓库准备 .icns 图标资源，关注 GitHub Releases 获取最新动态。',
      // FAQ
      'faq.title': '常见问题',
      'faq.subtitle': '关于 Tydora 你可能想知道的事。',
      'faq.q1': 'Tydora 是免费的吗？',
      'faq.a1': '完全免费，且基于 MIT 协议开源。任何人都可以自由使用、修改并分发。',
      'faq.q2': 'Tydora 与 Typora 是什么关系？',
      'faq.a2': 'Tydora 是一个向 Typora 致敬的独立开源项目，并非官方分支或克隆。命名上保留了 "Ty" 与 "ora"，延续"指尖上的礼物"这一浪漫期许。',
      'faq.q3': 'Tydora 支持哪些平台？',
      'faq.a3': '当前主要面向 Windows（NSIS 安装包）；macOS 构建正在筹备中，敬请期待。',
      'faq.q4': '可以导入 Typora 主题吗？',
      'faq.a4': '可以。Tydora 兼容 Typora 的主题 CSS 文件格式，在应用设置中导入即可生效。',
      'faq.q5': '如何参与贡献？',
      'faq.a5': '欢迎在 GitHub 上提交 Issue 报告问题，或 Fork 后发起 Pull Request。每一份贡献都让 Tydora 走得更远。',
      // Footer
      'footer.tagline': '指尖上的礼物',
      'footer.github': 'GitHub',
      'footer.releases': 'Releases',
      'footer.license': 'License (MIT)',
      'footer.stack': 'Built with Tauri · React · Vditor',
      'footer.copyright': '© 2025 Tydora. All rights reserved.'
    },
    en: {
      'nav.features': 'Features',
      'nav.themes': 'Themes',
      'nav.preview': 'Preview',
      'nav.download': 'Download',
      'nav.faq': 'FAQ',
      'hero.version': 'v0.1.0',
      'hero.title': 'A Gift at Your Fingertips',
      'hero.tagline': 'A modern Markdown editor for focused writing.',
      'hero.subtitle': 'A modern Markdown desktop editor — a tribute to Typora, turning immersive writing into a gift for everyone who loves words.',
      'hero.ctaDownload': 'Download for Windows',
      'hero.ctaGithub': 'View on GitHub',
      'hero.metaFree': 'Free Forever',
      'hero.metaOss': 'MIT Open Source',
      'hero.metaWin': 'Windows 10+',
      // App mock
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
      'features.title': 'Core Features',
      'features.subtitle': 'Crafted for those who love words — every feature revolves around fluid writing.',
      'features.f1Title': 'Three Editor Modes',
      'features.f1Desc': 'Powered by Vditor — WYSIWYG, Instant Rendering, and Split View. What you think is what you write.',
      'features.f2Title': 'Vault Management',
      'features.f2Desc': 'Obsidian-like multi-folder vaults with file tree, create/rename/drag — everything stays organized.',
      'features.f3Title': 'Command Palette',
      'features.f3Desc': 'Press Ctrl+P to fuzzy-search any command. Recent commands surface first.',
      'features.f4Title': 'Quick Open',
      'features.f4Desc': 'Ctrl+O lets you fuzzy-search any file in your vault. Jump in a snap.',
      'features.f5Title': 'Mindmap View',
      'features.f5Desc': 'Ctrl+M opens a markmap-powered mindmap in its own window — see your thinking at a glance.',
      'features.f6Title': 'Media Preview',
      'features.f6Desc': 'Built-in image zoom, video, audio, and PDF preview — no context switching, full focus.',
      'features.f7Title': 'Multi-Theme System',
      'features.f7Desc': '5 carefully crafted built-in themes + Typora theme import. See what you love.',
      'features.f8Title': 'Auto Update',
      'features.f8Desc': 'Powered by GitHub Releases — always stay on the latest version automatically.',
      'features.f9Title': 'Custom Shortcuts',
      'features.f9Desc': 'Every common action is bound to a keyboard shortcut. Work at your rhythm.',
      'features.f10Title': 'Outline & Stats',
      'features.f10Desc': 'Real-time outline navigation, word count, and typewriter mode for long-form writing.',
      'features.f11Title': 'Math Formulas',
      'features.f11Desc': 'KaTeX and MathJax dual engines. Academic writing made elegant.',
      'features.f12Title': 'Code Highlighting',
      'features.f12Desc': 'Multiple highlight themes and line numbers — a writing experience built for developers.',
      'themes.title': '5 Built-in Themes',
      'themes.subtitle': 'From fresh mint to deep and grounded — match every mood.',
      'preview.title': 'Preview',
      'preview.subtitle': 'Beautiful screenshots are on the way. Stay tuned.',
      'preview.p1': 'Editor Main View',
      'preview.p2': 'Theme Switching',
      'preview.p3': 'Vault Management',
      'preview.note': 'Real screenshots coming soon · 真实截图即将推出',
      'roadmap.title': 'Coming Soon',
      'roadmap.subtitle': 'These features are on the way — Tydora is becoming a more complete writing tool.',
      'roadmap.badge': 'Coming Soon',
      'roadmap.r1Title': 'Wikilinks & Backlinks',
      'roadmap.r1Desc': 'Support <code>[[note name]]</code> syntax, autocomplete, backlinks panel, and a knowledge graph. Connect the dots.',
      'roadmap.r2Title': 'Image Enhancement',
      'roadmap.r2Desc': 'Paste/drag upload, image host (SM.MS), multiple storage modes, compression, cropping, and batch management.',
      'roadmap.r3Title': 'Full Editor Settings',
      'roadmap.r3Desc': 'A finer-grained settings panel: font, autosave strategy, advanced shortcut customization, and more.',
      'download.title': 'Download',
      'download.subtitle': 'Start your Markdown writing journey right now.',
      'download.recommended': 'Recommended',
      'download.soon': 'Coming Soon',
      'download.format': 'NSIS Installer · 64-bit',
      'download.cta': 'Download Tydora',
      'download.req': 'System requirements: Windows 10 or later (Windows 11 recommended)',
      'download.macTitle': 'Planned',
      'download.macFormat': 'macOS build is being prepared',
      'download.macNote': '.icns icon assets are ready in the repo. Follow GitHub Releases for updates.',
      'faq.title': 'FAQ',
      'faq.subtitle': 'Things you might want to know about Tydora.',
      'faq.q1': 'Is Tydora free?',
      'faq.a1': 'Completely free, and open source under the MIT license. Anyone can freely use, modify, and distribute it.',
      'faq.q2': 'How is Tydora related to Typora?',
      'faq.a2': 'Tydora is an independent open-source project that pays tribute to Typora — not an official fork or clone. We kept the "Ty" and "ora" in the name to honor the romantic notion of "a gift at your fingertips".',
      'faq.q3': 'Which platforms does Tydora support?',
      'faq.a3': 'Currently Windows (NSIS installer); macOS build is in preparation — stay tuned.',
      'faq.q4': 'Can I import Typora themes?',
      'faq.a4': 'Yes. Tydora is compatible with Typora\'s theme CSS format. Import it from the in-app settings.',
      'faq.q5': 'How can I contribute?',
      'faq.a5': 'Open an issue on GitHub to report problems, or fork the repo and submit a Pull Request. Every contribution makes Tydora go further.',
      'footer.tagline': 'A gift at your fingertips',
      'footer.github': 'GitHub',
      'footer.releases': 'Releases',
      'footer.license': 'License (MIT)',
      'footer.stack': 'Built with Tauri · React · Vditor',
      'footer.copyright': '© 2025 Tydora. All rights reserved.'
    }
  };

  /* ========== Helpers ========== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ========== Language Toggle ========== */
  function applyLanguage(lang) {
    const dict = i18n[lang];
    if (!dict) return;

    // Update <html lang>
    document.documentElement.lang = lang === 'cn' ? 'zh-CN' : 'en';

    // Update title
    document.title = lang === 'cn'
      ? 'Tydora — 指尖上的礼物 | A Gift at Your Fingertips'
      : 'Tydora — A Gift at Your Fingertips';

    // Update description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.content = lang === 'cn'
        ? 'Tydora 是一款现代的 Markdown 桌面编辑器，致敬 Typora，延续所见即所得的极简理念。'
        : 'Tydora is a modern Markdown desktop editor — a tribute to Typora.';
    }

    // Update meta theme color
    const metaOgTitle = document.querySelector('meta[property="og:title"]');
    if (metaOgTitle) {
      metaOgTitle.content = lang === 'cn'
        ? 'Tydora — 指尖上的礼物'
        : 'Tydora — A Gift at Your Fingertips';
    }

    // Apply to all data-i18n elements
    $$('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (dict[key] !== undefined) {
        el.innerHTML = dict[key];
      }
    });

    // Toggle button state
    $$('.lang-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.lang === lang);
    });

    // Persist
    try {
      localStorage.setItem('tydora-lang', lang);
    } catch (e) {
      /* localStorage might be disabled — fail silently */
    }
  }

  function initLanguage() {
    let saved = 'cn';
    try {
      saved = localStorage.getItem('tydora-lang') || 'cn';
    } catch (e) {
      /* default to 'cn' */
    }

    // Also respect browser language on first visit
    if (!localStorage.getItem('tydora-lang')) {
      const browserLang = (navigator.language || '').toLowerCase();
      if (browserLang.startsWith('en')) {
        saved = 'en';
      }
    }

    applyLanguage(saved);

    // Bind clicks on language options
    $$('.lang-option').forEach(opt => {
      opt.addEventListener('click', () => {
        applyLanguage(opt.dataset.lang);
        // Close mobile menu if open
        closeMobileMenu();
      });
    });
  }

  /* ========== Mobile Menu ========== */
  function initMobileMenu() {
    const hamburger = $('#hamburger');
    const navLinks = $('.nav-links');
    const overlay = $('#navOverlay');
    if (!hamburger || !navLinks) return;

    hamburger.addEventListener('click', () => {
      const isOpen = hamburger.classList.toggle('open');
      navLinks.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
      if (overlay) overlay.classList.toggle('visible', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    if (overlay) {
      overlay.addEventListener('click', closeMobileMenu);
    }

    $$('.nav-links a').forEach(link => {
      link.addEventListener('click', () => closeMobileMenu());
    });
  }

  function closeMobileMenu() {
    const hamburger = $('#hamburger');
    const navLinks = $('.nav-links');
    const overlay = $('#navOverlay');
    if (hamburger) {
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
    if (navLinks) navLinks.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  /* ========== Navbar Shadow on Scroll ========== */
  function initNavbarScroll() {
    const navbar = $('#navbar');
    if (!navbar) return;

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          navbar.classList.toggle('scrolled', window.scrollY > 50);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    // Run once on init
    onScroll();
  }

  /* ========== Scroll-in Animations (Intersection Observer) ========== */
  function initScrollAnimations() {
    if (!('IntersectionObserver' in window)) {
      // Fallback: just show everything
      $$('.animate-on-scroll').forEach(el => el.classList.add('visible'));
      return;
    }

    const reveal = el => {
      el.classList.add('visible');
      observer.unobserve(el);
    };

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) reveal(entry.target);
        });
      },
      {
        threshold: 0,
        rootMargin: '0px 0px 80px 0px'  // trigger slightly before element enters viewport
      }
    );

    $$('.animate-on-scroll').forEach(el => observer.observe(el));

    // Safety net: after page load, reveal anything that's already in (or above) the viewport.
    requestAnimationFrame(() => {
      $$('.animate-on-scroll').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight) reveal(el);
      });
    });

    // Scroll-time safety net: as the user scrolls, reveal every element that
    // is currently in (or just below) the viewport. This is the failsafe for
    // fast scroll / programmatic scroll / hash navigation where the observer
    // might miss the trigger frame.
    let scrollTicking = false;
    const onScrollReveal = () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        const remaining = $$('.animate-on-scroll:not(.visible)');
        const vh = window.innerHeight;
        remaining.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.top < vh + 100) reveal(el);
        });
        scrollTicking = false;
      });
    };
    window.addEventListener('scroll', onScrollReveal, { passive: true });
    window.addEventListener('resize', onScrollReveal, { passive: true });
  }

  /* ========== Smooth scroll for anchor links (with offset for fixed navbar) ========== */
  function initSmoothScroll() {
    $$('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', e => {
        const href = anchor.getAttribute('href');
        if (!href || href === '#') return;
        const target = document.querySelector(href);
        if (!target) return;

        e.preventDefault();
        const navbarHeight = 64; // matches --navbar-height
        const top = target.getBoundingClientRect().top + window.scrollY - navbarHeight;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });
  }

  /* ========== Highlight current section in nav (optional scroll-spy) ========== */
  function initScrollSpy() {
    if (!('IntersectionObserver' in window)) return;

    const sections = $$('main section[id]');
    const navLinks = $$('.nav-links a[href^="#"]');
    if (!sections.length || !navLinks.length) return;

    const linkMap = new Map();
    navLinks.forEach(link => {
      const id = link.getAttribute('href').slice(1);
      linkMap.set(id, link);
    });

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            navLinks.forEach(link => link.classList.remove('active-section'));
            const active = linkMap.get(id);
            if (active) active.classList.add('active-section');
          }
        });
      },
      { rootMargin: '-40% 0px -55% 0px' }
    );

    sections.forEach(section => observer.observe(section));
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

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

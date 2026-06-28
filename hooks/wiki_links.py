"""MkDocs hook: convert [[wiki-links]] to standard markdown links and embed graph data."""
import re
import os
import json

# Wiki link name -> relative path from docs root (without .md)
WIKI_MAP = {
    "快速开始": "快速开始",
    "编辑模式": "编辑器/编辑模式",
    "右键菜单": "编辑器/右键菜单",
    "打字机模式": "编辑器/打字机模式",
    "Markdown语法": "编辑器/Markdown语法",
    "表格操作": "编辑器/表格操作",
    "数学公式": "编辑器/数学公式",
    "代码块": "编辑器/代码块",
    "仓库": "文件管理/仓库",
    "文件树": "文件管理/文件树",
    "文件操作": "文件管理/文件操作",
    "文件预览": "文件管理/文件预览",
    "快速打开": "导航与搜索/快速打开",
    "命令面板": "导航与搜索/命令面板",
    "大纲面板": "导航与搜索/大纲面板",
    "Wiki链接": "知识管理/Wiki链接",
    "嵌入内容": "知识管理/嵌入内容",
    "反向链接": "知识管理/反向链接",
    "知识图谱": "知识管理/知识图谱",
    "链接索引": "知识管理/链接索引",
    "思维导图": "思维导图",
    "内置主题": "主题/内置主题",
    "Typora主题": "主题/Typora主题",
    "代码高亮主题": "主题/代码高亮主题",
    "通用设置": "设置/通用设置",
    "编辑器设置": "设置/编辑器设置",
    "快捷键设置": "设置/快捷键设置",
    "思维导图设置": "设置/思维导图设置",
    "图片设置": "设置/图片设置",
    "快捷键速查": "快捷键速查",
    "关于": "关于",
    "双链图谱说": "双链图谱说",
}

WIKI_LINK_RE = re.compile(r'\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]')

GROUP_MAP = {
    "编辑器/": "编辑器",
    "文件管理/": "文件管理",
    "导航与搜索/": "导航与搜索",
    "知识管理/": "知识管理",
    "主题/": "主题",
    "设置/": "设置",
}

_graph_data = None


def _build_graph_data(docs_dir):
    global _graph_data
    if _graph_data is not None:
        return _graph_data

    nodes = []
    links = []
    node_ids = set()

    for root, dirs, files_list in os.walk(docs_dir):
        for f in files_list:
            if not f.endswith('.md'):
                continue
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, docs_dir).replace('\\', '/')
            page_name = rel_path[:-3]

            group = ""
            for prefix, grp in GROUP_MAP.items():
                if rel_path.startswith(prefix):
                    group = grp
                    break

            display = page_name
            for name, path in WIKI_MAP.items():
                if path == page_name:
                    display = name
                    break

            if page_name not in node_ids:
                nodes.append({"id": page_name, "label": display, "group": group})
                node_ids.add(page_name)

            try:
                with open(full_path, 'r', encoding='utf-8') as fp:
                    content = fp.read()
            except Exception:
                continue

            for m in WIKI_LINK_RE.finditer(content):
                link_name = m.group(1).strip()
                target_path = None
                if link_name in WIKI_MAP:
                    target_path = WIKI_MAP[link_name]
                else:
                    for key, path in WIKI_MAP.items():
                        if link_name == key or link_name.endswith("/" + key):
                            target_path = path
                            break

                if target_path:
                    if target_path not in node_ids:
                        tgt_display = target_path.split('/')[-1]
                        for name, path in WIKI_MAP.items():
                            if path == target_path:
                                tgt_display = name
                                break
                        tgt_group = ""
                        for prefix, grp in GROUP_MAP.items():
                            if target_path.startswith(prefix):
                                tgt_group = grp
                                break
                        nodes.append({"id": target_path, "label": tgt_display, "group": tgt_group})
                        node_ids.add(target_path)

                    link_pair = (page_name, target_path)
                    if link_pair not in [(l['source'], l['target']) for l in links]:
                        links.append({"source": page_name, "target": target_path})

    _graph_data = {"nodes": nodes, "links": links}
    print(f"[wiki_links] Built graph: {len(nodes)} nodes, {len(links)} links")
    return _graph_data


def _resolve_link(source_path, target_path):
    source_dir = os.path.dirname(source_path)
    rel = os.path.relpath(target_path, source_dir).replace('\\', '/')
    if not rel.startswith('.'):
        rel = './' + rel
    return rel


def on_page_markdown(markdown, page, config, files):
    source = page.file.src_path

    def replace_link(m):
        name = m.group(1).strip()
        display = m.group(2).strip() if m.group(2) else name

        if name in WIKI_MAP:
            target = WIKI_MAP[name] + ".md"
            href = _resolve_link(source, target)
            return f'[{display}]({href})'

        for key, path in WIKI_MAP.items():
            if name == key or name.endswith("/" + key):
                target = path + ".md"
                href = _resolve_link(source, target)
                return f'[{display}]({href})'

        return f'[{display}](#{name})'

    return WIKI_LINK_RE.sub(replace_link, markdown)


def on_post_page(output, page, config):
    """Inject graph data script tag into the final HTML."""
    docs_dir = config['docs_dir']
    graph_data = _build_graph_data(docs_dir)
    graph_json = json.dumps(graph_data, ensure_ascii=False)

    script_tag = f'<script>window.__GRAPH_DATA__ = {graph_json};</script>'

    # Insert before </body>
    if '</body>' in output:
        output = output.replace('</body>', script_tag + '\n</body>')

    return output

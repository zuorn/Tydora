import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { readDir, writeTextFile, mkdir, remove, rename } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { useTheme } from "./themes";
import { ConfirmDialog } from "./ConfirmDialog";
import "./Sidebar.css";

// ── Types ────────────────────────────────────────────────────────────

export interface VaultInfo {
  name: string;
  path: string;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  children: TreeNode[] | null;
  expanded: boolean;
}

interface SidebarProps {
  vaults: VaultInfo[];
  activeVaultIndex: number;
  currentFilePath: string | null;
  content: string;
  onSelectFile: (path: string) => void;
  onSelectHeading: (level: number, text: string, line: number) => void;
  onNewVault: (path: string, name: string) => void;
  onSwitchVault: (index: number) => void;
  onRemoveVault: (index: number) => void;
  collapsed: boolean;
  refreshKey: number;
  width: number;
  onWidthChange: (width: number) => void;
}

interface ContextMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

function sortTreeNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function loadDirectory(dirPath: string): Promise<TreeNode[]> {
  try {
    const entries = await readDir(dirPath);
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = joinPath(dirPath, entry.name);
      nodes.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory,
        isFile: entry.isFile,
        children: entry.isDirectory ? null : null,
        expanded: false,
      });
    }
    return sortTreeNodes(nodes);
  } catch {
    return [];
  }
}

function pathSep(): string {
  return navigator.platform?.toLowerCase().includes("win") ? "\\" : "/";
}

function joinPath(parent: string, child: string): string {
  const sep = pathSep();
  const clean = parent.endsWith("/") || parent.endsWith("\\") ? parent.slice(0, -1) : parent;
  return `${clean}${sep}${child}`;
}

function parentPath(path: string): string {
  const sep = pathSep();
  const idx = path.lastIndexOf(sep);
  return idx > 0 ? path.substring(0, idx) : path;
}

// ── ContextMenu Component ────────────────────────────────────────────

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    if (!menuRef.current) return;

    const menu = menuRef.current;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const rect = menu.getBoundingClientRect();
    const GAP = 4;

    let left = x;
    let top = y;

    if (left + rect.width > window.innerWidth - GAP) {
      left = x - rect.width;
    }
    if (top + rect.height > window.innerHeight - GAP) {
      top = y - rect.height;
    }
    if (left < GAP) left = GAP;
    if (top < GAP) top = GAP;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }, [x, y]);

  return (
    <div ref={menuRef} className="context-menu">
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && <div className="context-menu-divider" />}
          <div
            className={`context-menu-item${item.danger ? " danger" : ""}${item.disabled ? " disabled" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Context Menu Action Helpers ──────────────────────────────────────

interface FileActions {
  onOpen: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onSearch: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
  onOpenLocation: () => void;
  onNewWindow: () => void;
}

function getFileMenuItems(actions: FileActions): ContextMenuItem[] {
  return [
    { label: "打开", onClick: actions.onOpen },
    { label: "在新窗口中打开", onClick: actions.onNewWindow },
    { label: "新建文件", onClick: actions.onNewFile, separator: true },
    { label: "新建文件夹", onClick: actions.onNewFolder },
    { label: "搜索", onClick: actions.onSearch },
    { label: "重命名", onClick: actions.onRename, separator: true },
    { label: "创建副本", onClick: actions.onDuplicate },
    { label: "删除", onClick: actions.onDelete, danger: true, separator: true },
    { label: "复制文件路径", onClick: actions.onCopyPath, separator: true },
    { label: "打开文件位置", onClick: actions.onOpenLocation },
  ];
}

function getFolderMenuItems(actions: FileActions): ContextMenuItem[] {
  return [
    { label: "新建文件", onClick: actions.onNewFile },
    { label: "新建文件夹", onClick: actions.onNewFolder },
    { label: "搜索", onClick: actions.onSearch },
    { label: "重命名", onClick: actions.onRename, separator: true },
    { label: "删除", onClick: actions.onDelete, danger: true, separator: true },
    { label: "复制文件路径", onClick: actions.onCopyPath },
    { label: "打开文件位置", onClick: actions.onOpenLocation },
  ];
}

function getBlankMenuItems(actions: FileActions): ContextMenuItem[] {
  return [
    { label: "新建文件", onClick: actions.onNewFile },
    { label: "新建文件夹", onClick: actions.onNewFolder },
    { label: "搜索", onClick: actions.onSearch },
    { label: "复制文件路径", onClick: actions.onCopyPath },
    { label: "打开文件位置", onClick: actions.onOpenLocation },
  ];
}

function showDevAlert() {
  alert("此功能开发中");
}

// ── TreeNode Component ───────────────────────────────────────────────

function TreeNodeComp({
  node,
  depth,
  activePath,
  onSelect,
  onRefresh,
  onReload,
  rootPath,
  dragOverPath,
  onMouseDown,
  editingPath,
  onStartEdit,
  onFinishEdit,
}: {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  onSelect: (path: string) => void;
  onRefresh: () => void;
  onReload: (expandPath?: string) => void;
  rootPath: string;
  dragOverPath: string | null;
  onMouseDown: (e: React.MouseEvent, nodePath: string) => void;
  editingPath: string | null;
  onStartEdit: (path: string) => void;
  onFinishEdit: (path: string, newName: string) => void;
}) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = editingPath === node.path;

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      const inp = inputRef.current;
      inp.focus();
      const val = inp.value;
      const dot = val.lastIndexOf(".");
      if (dot > 0) {
        inp.setSelectionRange(0, dot);
      } else {
        inp.select();
      }
    }
  }, [isEditing]);

  const handleToggle = useCallback(async () => {
    if (!node.isDirectory) {
      onSelect(node.path);
      return;
    }
    if (node.children === null) {
      node.children = await loadDirectory(node.path);
    }
    node.expanded = !node.expanded;
    onRefresh();
  }, [node, onSelect, onRefresh]);

  // ── Actions ──

  const handleNewFile = useCallback(async () => {
    const targetDir = node.isDirectory ? node.path : parentPath(node.path);
    const filePath = joinPath(targetDir, "untitled.md");
    try { await writeTextFile(filePath, ""); await onReload(targetDir); onStartEdit(filePath); }
    catch (err) { console.error("新建文件失败:", err); }
  }, [node, onReload, onStartEdit]);

  const handleNewFolder = useCallback(async () => {
    const targetDir = node.isDirectory ? node.path : parentPath(node.path);
    const dirPath = joinPath(targetDir, "新建文件夹");
    try { await mkdir(dirPath); await onReload(targetDir); onStartEdit(dirPath); }
    catch (err) { console.error("新建文件夹失败:", err); }
  }, [node, onReload, onStartEdit]);

  const handleRename = useCallback(async () => {
    onStartEdit(node.path);
  }, [node, onStartEdit]);

  const handleDelete = useCallback(() => {
    setDeleteConfirmOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    setDeleteConfirmOpen(false);
    try { await remove(node.path, { recursive: true }); onReload(); }
    catch (err) { console.error("删除失败:", err); }
  }, [node, onReload]);

  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(node.path).catch(() => { prompt("文件路径:", node.path); });
  }, [node]);

  const handleOpenLocation = useCallback(() => {
    navigator.clipboard.writeText(node.path).then(() => {
      alert(`文件路径已复制到剪贴板:\n${node.path}`);
    }).catch(() => { alert(`文件路径:\n${node.path}`); });
  }, [node]);

  const actions: FileActions = {
    onOpen: handleToggle,
    onNewWindow: showDevAlert,
    onNewFile: handleNewFile,
    onNewFolder: handleNewFolder,
    onSearch: showDevAlert,
    onRename: handleRename,
    onDuplicate: showDevAlert,
    onDelete: handleDelete,
    onCopyPath: handleCopyPath,
    onOpenLocation: handleOpenLocation,
  };

  const menuItems = node.isDirectory
    ? getFolderMenuItems(actions)
    : getFileMenuItems(actions);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const isActive = activePath === node.path;
  const indent = depth * 16;
  const isDragOver = node.isDirectory && dragOverPath === node.path;

  return (
    <div className="tree-branch">
      <div
        ref={nodeRef}
        className={`tree-node${isActive ? " active" : ""}${isDragOver ? " drag-over" : ""}`}
        style={{ paddingLeft: `${12 + indent}px` }}
        onClick={handleToggle}
        onContextMenu={handleContextMenu}
        onMouseDown={(e) => onMouseDown(e, node.path)}
        title={node.path}
        data-path={node.path}
        data-is-dir={node.isDirectory ? "1" : "0"}
      >
        <span className="tree-icon">
          {node.isDirectory ? (node.expanded ? "📂" : "📁") : "📄"}
        </span>
        {isEditing ? (
          <input
            ref={inputRef}
            className="tree-name-input"
            defaultValue={node.name}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onFinishEdit(node.path, (e.target as HTMLInputElement).value);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onFinishEdit(node.path, node.name);
              }
            }}
            onBlur={(e) => {
              onFinishEdit(node.path, e.target.value);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="tree-name">{node.name}</span>
        )}
        {node.isDirectory && (
          <span className="tree-badge">
            {node.children ? node.children.length : "…"}
          </span>
        )}
      </div>

      {node.isDirectory && node.expanded && node.children && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNodeComp
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              onSelect={onSelect}
              onRefresh={onRefresh}
              onReload={onReload}
              rootPath={rootPath}
              dragOverPath={dragOverPath}
              onMouseDown={onMouseDown}
              editingPath={editingPath}
              onStartEdit={onStartEdit}
              onFinishEdit={onFinishEdit}
            />
          ))}
        </div>
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={menuItems}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="删除确认"
        message={node.isDirectory
          ? `确定要删除文件夹 "${node.name}" 及其所有内容吗？`
          : `确定要删除文件 "${node.name}" 吗？`}
        type="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}

// ── FileTree Component ───────────────────────────────────────────────

function FileTree({
  rootPath,
  activePath,
  onSelect,
  refreshKey,
}: {
  rootPath: string;
  activePath: string | null;
  onSelect: (path: string) => void;
  refreshKey: number;
}) {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [, forceUpdate] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);

  const handleStartEdit = useCallback((path: string) => {
    setEditingPath(path);
  }, []);

  // ── Drag state (mouse-event based) ──
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const dragNodeRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; path: string } | null>(null);

  // 记录展开的目录，reload 后恢复
  const rootNodesRef = useRef<TreeNode[]>([]);
  rootNodesRef.current = rootNodes;

  const collectExpanded = useCallback((nodes: TreeNode[]) => {
    const paths = new Set<string>();
    const walk = (list: TreeNode[]) => {
      for (const n of list) {
        if (n.isDirectory && n.expanded) paths.add(n.path);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return paths;
  }, []);

  const restoreExpanded = useCallback(async (nodes: TreeNode[], paths: Set<string>) => {
    for (const n of nodes) {
      if (paths.has(n.path)) {
        n.children = await loadDirectory(n.path);
        n.expanded = true;
        if (n.children) await restoreExpanded(n.children, paths);
      }
    }
  }, []);

  const loadRoot = useCallback(async () => {
    const nodes = await loadDirectory(rootPath);
    setRootNodes(nodes);
  }, [rootPath]);

  const handleRefresh = useCallback(() => {
    forceUpdate((n) => n + 1);
  }, []);

  const handleReload = useCallback(async (expandPath?: string) => {
    const paths = collectExpanded(rootNodesRef.current);
    if (expandPath) paths.add(expandPath);
    const nodes = await loadDirectory(rootPath);
    await restoreExpanded(nodes, paths);
    setRootNodes(nodes);
    handleRefresh();
  }, [rootPath, collectExpanded, restoreExpanded, handleRefresh]);

  const handleFinishEdit = useCallback(async (path: string, newName: string) => {
    setEditingPath(null);
    if (!newName || newName.trim() === "") return;
    newName = newName.trim();
    const currentName = path.split(pathSep()).pop() || "";
    if (newName === currentName) return;
    const p = parentPath(path);
    const newPath = joinPath(p, newName);
    try { await rename(path, newPath); await handleReload(); }
    catch (err) { console.error("重命名失败:", err); }
  }, [handleReload]);

  // ── Mouse-based Drag & Drop ──
  const handleMouseDown = useCallback((e: React.MouseEvent, nodePath: string) => {
    // Only left button
    if (e.button !== 0) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, path: nodePath };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      // Start dragging after 5px movement
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

      // Dragging started
      if (!dragNodeRef.current) {
        dragNodeRef.current = dragStartRef.current.path;
      }

      // Find which tree-node the mouse is over
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const treeNode = el?.closest("[data-path]") as HTMLElement | null;
      if (treeNode && treeNode.dataset.isDir === "1") {
        const p = treeNode.dataset.path || "";
        if (p !== dragNodeRef.current) {
          setDragOverPath(p);
        }
      } else {
        setDragOverPath(null);
      }
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      if (dragNodeRef.current) {
        // Dragging was active — find drop target
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const treeNode = el?.closest("[data-path]") as HTMLElement | null;
        if (treeNode && treeNode.dataset.isDir === "1") {
          const targetDir = treeNode.dataset.path || "";
          const srcPath = dragNodeRef.current;
          if (srcPath && targetDir && srcPath !== targetDir) {
            const fileName = srcPath.split(pathSep()).pop() || "untitled";
            const targetPath = joinPath(targetDir, fileName);
            if (srcPath !== targetPath) {
              try {
                await rename(srcPath, targetPath);
                await handleReload();
              } catch (err) {
                console.error("移动失败:", err);
              }
            }
          }
        }
      }

      // Reset
      dragStartRef.current = null;
      dragNodeRef.current = null;
      setDragOverPath(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleReload]);

  // ── Blank area actions ──
  const handleNewRootFile = useCallback(async () => {
    const filePath = joinPath(rootPath, "untitled.md");
    try { await writeTextFile(filePath, ""); await handleReload(); handleStartEdit(filePath); }
    catch (err) { console.error("新建文件失败:", err); }
  }, [rootPath, handleReload, handleStartEdit]);

  const handleNewRootFolder = useCallback(async () => {
    const dirPath = joinPath(rootPath, "新建文件夹");
    try { await mkdir(dirPath); await handleReload(); handleStartEdit(dirPath); }
    catch (err) { console.error("新建文件夹失败:", err); }
  }, [rootPath, handleReload, handleStartEdit]);

  const handleCopyRootPath = useCallback(() => {
    navigator.clipboard.writeText(rootPath).catch(() => { prompt("文件夹路径:", rootPath); });
  }, [rootPath]);

  const handleOpenRootLocation = useCallback(() => {
    navigator.clipboard.writeText(rootPath).then(() => {
      alert(`文件夹路径已复制到剪贴板:\n${rootPath}`);
    }).catch(() => { alert(`文件夹路径:\n${rootPath}`); });
  }, [rootPath]);

  const blankActions: FileActions = {
    onOpen: () => {},
    onNewWindow: showDevAlert,
    onNewFile: handleNewRootFile,
    onNewFolder: handleNewRootFolder,
    onSearch: showDevAlert,
    onRename: () => {},
    onDuplicate: showDevAlert,
    onDelete: () => {},
    onCopyPath: handleCopyRootPath,
    onOpenLocation: handleOpenRootLocation,
  };

  const handleBlankContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".tree-node")) return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => { loadRoot(); }, [loadRoot, refreshKey]);

  return (
    <div className="sidebar-tree" onContextMenu={handleBlankContextMenu}>
      {rootNodes.length > 0 &&
        rootNodes.map((node) => (
          <TreeNodeComp
            key={node.path}
            node={node}
            depth={0}
            activePath={activePath}
            onSelect={onSelect}
            onRefresh={handleRefresh}
            onReload={handleReload}
            rootPath={rootPath}
            dragOverPath={dragOverPath}
            onMouseDown={handleMouseDown}
            editingPath={editingPath}
            onStartEdit={handleStartEdit}
            onFinishEdit={handleFinishEdit}
          />
        ))}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={getBlankMenuItems(blankActions)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

// ── Outline Component ───────────────────────────────────────────────

interface OutlineItem {
  level: number;
  text: string;
  line: number;
}

function parseOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (m) {
      items.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
    }
  }
  return items;
}

function Outline({
  content,
  onSelectHeading,
}: {
  content: string;
  onSelectHeading: (level: number, text: string, line: number) => void;
}) {
  const items = parseOutline(content);

  if (items.length === 0) {
    return (
      <div className="sidebar-tree">
        <div className="tree-empty">无标题</div>
        <div className="tree-empty-hint">使用 # 标题语法来创建大纲</div>
      </div>
    );
  }

  return (
    <div className="sidebar-tree">
      {items.map((item, i) => (
        <div
          key={i}
          className="outline-item"
          style={{ paddingLeft: `${12 + (item.level - 1) * 16}px` }}
          title={item.text}
          onClick={() => onSelectHeading(item.level, item.text, item.line)}
        >
          <span className="outline-level">H{item.level}</span>
          <span className="outline-text">{item.text}</span>
        </div>
      ))}
    </div>
  );
}

// ── VaultSwitcher ────────────────────────────────────────────────────

function VaultSwitcher({
  vaults,
  activeIndex,
  onSwitch,
  onNew,
  onRemove,
}: {
  vaults: VaultInfo[];
  activeIndex: number;
  onSwitch: (index: number) => void;
  onNew: () => void;
  onRemove: (index: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removingVaultIndex, setRemovingVaultIndex] = useState<number>(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const activeVault = activeIndex >= 0 ? vaults[activeIndex] : null;
  const { theme, setTheme } = useTheme();

  // Close vault menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuOpen]);

  // Close settings popup on outside click
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [settingsOpen]);

  if (vaults.length === 0) {
    return (
      <div className="sidebar-footer">
        <button className="vault-open-btn" onClick={onNew}>
          <span className="vault-icon">🗄️</span>
          <span className="vault-name">打开仓库</span>
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar-footer">
      <div
        className="vault-current"
        title="切换仓库"
      >
        <span className="vault-icon">🗄️</span>
        <span
          className="vault-name"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
            setSettingsOpen(false);
          }}
        >
          {activeVault ? activeVault.name : "未选择"}
        </span>
        <button
          className="vault-menu-btn"
          title="设置"
          onClick={(e) => {
            e.stopPropagation();
            setSettingsOpen((prev) => !prev);
            setMenuOpen(false);
          }}
        >
          ⚙
        </button>
      </div>

      {menuOpen && (
        <div ref={menuRef} className="vault-menu">
          <div className="vault-menu-list">
            {vaults.map((vault, i) => (
              <div
                key={vault.path}
                className={`vault-menu-item${i === activeIndex ? " active" : ""}`}
                onClick={() => {
                  onSwitch(i);
                  setMenuOpen(false);
                }}
              >
                <span className="vault-menu-name">{vault.name}</span>
                <button
                  className="vault-menu-remove-btn"
                  title="移除此仓库"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRemovingVaultIndex(i);
                    setRemoveConfirmOpen(true);
                  }}
                >
                  ✕
                </button>
                {i === activeIndex && <span className="vault-menu-check">✓</span>}
              </div>
            ))}
          </div>
          <div className="vault-menu-divider" />
          <div
            className="vault-menu-item vault-menu-manage"
            onClick={() => {
              setMenuOpen(false);
              onNew();
            }}
          >
            <span className="vault-menu-icon">🗄️</span>
            <span>打开新仓库</span>
          </div>
        </div>
      )}

      {/* ── 设置弹出面板 ── */}
      {settingsOpen && (
        <div ref={settingsRef} className="vault-menu settings-popup">
          <div className="settings-popup-header">设置</div>
          <div className="vault-menu-divider" />
          <div className="settings-popup-item">
            <span className="settings-popup-label">主题</span>
            <select
              className="settings-popup-select"
              value={theme}
              onChange={(e) => setTheme(e.target.value as any)}
            >
              <option value="catppuccin-mocha">Catppuccin Mocha</option>
              <option value="white">白色</option>
              <option value="mint">Mint</option>
              <option value="mint-dark">Mint Dark</option>
            </select>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={removeConfirmOpen}
        title="移除仓库"
        message={`确定要移除仓库 "${vaults[removingVaultIndex]?.name || ""}" 吗？\n此操作不会删除本地文件。`}
        type="warning"
        onConfirm={() => {
          onRemove(removingVaultIndex);
          setRemoveConfirmOpen(false);
        }}
        onCancel={() => setRemoveConfirmOpen(false)}
      />
    </div>
  );
}

// ── Sidebar Main ─────────────────────────────────────────────────────

export default function Sidebar({
  vaults,
  activeVaultIndex,
  currentFilePath,
  content,
  onSelectFile,
  onSelectHeading,
  onNewVault,
  onSwitchVault,
  onRemoveVault,
  collapsed,
  refreshKey,
  width,
  onWidthChange,
}: SidebarProps) {
  const activeVault = activeVaultIndex >= 0 ? vaults[activeVaultIndex] : null;
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState<"files" | "outline">("files");

  const handleSelectFile = useCallback(
    (path: string) => { onSelectFile(path); },
    [onSelectFile],
  );

  const handleNewVault = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择文件夹作为仓库",
      });
      if (selected) {
        const name = selected.split(/[/\\]/).pop() || selected;
        onNewVault(selected, name);
      }
    } catch (err) {
      console.error("打开文件夹失败:", err);
    }
  }, [onNewVault]);

  // Resize logic
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setStartX(e.clientX);
    setStartWidth(width);
  }, [width]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const newWidth = startWidth + deltaX;
      const clampedWidth = Math.max(180, Math.min(800, newWidth));
      onWidthChange(clampedWidth);
    };
    const handleMouseUp = () => { setIsResizing(false); };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, onWidthChange, startX, startWidth]);

  return (
    <div
      className={`sidebar${collapsed ? " collapsed" : ""}${isResizing ? " resizing" : ""}`}
      style={{ width: collapsed ? 0 : width }}
    >
      <div className="sidebar-topbar" />

      <div className="sidebar-header">
        <button
          className={`sidebar-tab${activeTab === "files" ? " active" : ""}`}
          onClick={() => setActiveTab("files")}
        >
          文件
        </button>
        <button
          className={`sidebar-tab${activeTab === "outline" ? " active" : ""}`}
          onClick={() => setActiveTab("outline")}
        >
          大纲
        </button>
      </div>

      {activeTab === "files" && (
        activeVault ? (
          <FileTree
            rootPath={activeVault.path}
            activePath={currentFilePath}
            onSelect={handleSelectFile}
            refreshKey={refreshKey}
          />
        ) : (
          <div className="sidebar-tree">
            <div className="tree-empty">尚未打开仓库</div>
            <div className="tree-empty-hint">点击底部按钮打开一个文件夹</div>
          </div>
        )
      )}

      {activeTab === "outline" && (
        <Outline content={content} onSelectHeading={onSelectHeading} />
      )}

      <VaultSwitcher
        vaults={vaults}
        activeIndex={activeVaultIndex}
        onSwitch={onSwitchVault}
        onNew={handleNewVault}
        onRemove={onRemoveVault}
      />

      {!collapsed && (
        <div className="sidebar-resize-handle" onMouseDown={handleMouseDown} />
      )}
    </div>
  );
}

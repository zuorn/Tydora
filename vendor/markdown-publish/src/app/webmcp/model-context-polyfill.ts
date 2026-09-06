/**
 * Minimal in-page polyfill for the WebMCP imperative API (`navigator.modelContext`,
 * W3C Web Model Context draft). Zero third-party code.
 *
 * Scope: it installs a spec-shaped registry so our tool-registration code is
 * stable and forward-compatible — when a browser ships the native API we detect
 * it and skip the polyfill entirely. The registry is also what DevTools / the
 * page itself use to introspect and invoke tools.
 *
 * It deliberately does NOT invent a cross-document transport: there is no
 * universal one yet, and a homegrown protocol no agent speaks would be
 * security theatre. Real out-of-page agent access comes from the native
 * browser API (or a WebMCP extension the user installs), both of which provide
 * their own transport over this same `navigator.modelContext` surface.
 */

export interface McpToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<McpToolResult> | McpToolResult;
}

export interface ModelContextLike {
  registerTool(tool: McpToolDef, options?: { signal?: AbortSignal }): void;
  unregisterTool(name: string): void;
  listTools(): { name: string; description: string; inputSchema: Record<string, unknown> }[];
  callTool(req: { name: string; arguments?: Record<string, unknown> }): Promise<McpToolResult>;
  addEventListener(type: 'toolchange', cb: () => void): void;
  removeEventListener(type: 'toolchange', cb: () => void): void;
}

/**
 * Returns the page's `navigator.modelContext` — the native one if present,
 * otherwise installs and returns the polyfill. `null` outside a browser.
 */
export function ensureModelContext(): ModelContextLike | null {
  if (typeof navigator === 'undefined') {
    return null;
  }
  const nav = navigator as unknown as { modelContext?: ModelContextLike };
  if (nav.modelContext) {
    return nav.modelContext;
  }

  const tools = new Map<string, McpToolDef>();
  const bus = new EventTarget();
  const emit = () => bus.dispatchEvent(new Event('toolchange'));

  const mc: ModelContextLike = {
    registerTool(tool, options) {
      tools.set(tool.name, tool);
      options?.signal?.addEventListener('abort', () => mc.unregisterTool(tool.name));
      emit();
    },
    unregisterTool(name) {
      if (tools.delete(name)) {
        emit();
      }
    },
    listTools() {
      return [...tools.values()].map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      }));
    },
    async callTool(req) {
      const tool = req && tools.get(req.name);
      if (!tool) {
        return {
          content: [{ type: 'text', text: `Tool not found: ${req?.name}` }],
          isError: true,
        };
      }
      try {
        return await tool.execute(req.arguments ?? {});
      } catch (err) {
        return { content: [{ type: 'text', text: String(err) }], isError: true };
      }
    },
    addEventListener: (type, cb) => bus.addEventListener(type, cb),
    removeEventListener: (type, cb) => bus.removeEventListener(type, cb),
  };

  Object.defineProperty(navigator, 'modelContext', {
    value: mc,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  return mc;
}

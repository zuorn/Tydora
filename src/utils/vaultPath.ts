/** 统一路径分隔符，便于跨平台比较仓库与文件路径。 */
export function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** 判断文件路径是否位于指定仓库根目录下。 */
export function isPathInVault(filePath: string, vaultPath: string): boolean {
  const file = normalizeVaultPath(filePath);
  const vault = normalizeVaultPath(vaultPath);
  if (!vault) return false;
  return file === vault || file.startsWith(`${vault}/`);
}

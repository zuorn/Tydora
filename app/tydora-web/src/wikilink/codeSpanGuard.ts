/**
 * 在替换文本（如 WikiLink）时，跳过被反引号包裹的内联代码段，
 * 避免 [[...]] / ![[...]] 等内容在代码中也被错误转成链接。
 *
 * markdown-it 在解析 inline 内容之前，反引号代码段尚未被识别为 <code>，
 * 因此 WikiLink 的全局替换会误伤代码内的 `[[...]]`。这里按反引号边界
 * 将文本切分，仅对代码段之外的部分应用替换函数。
 */
export function applyOutsideCodeSpans(
  content: string,
  apply: (text: string) => string
): string {
  let result = "";
  let buffer = "";
  let i = 0;
  const n = content.length;

  const flush = () => {
    result += apply(buffer);
    buffer = "";
  };

  while (i < n) {
    if (content[i] === "`") {
      // 计算起始反引号的连续长度（处理 `` ` `` 这类多反引号代码）
      let tickLen = 0;
      while (i + tickLen < n && content[i + tickLen] === "`") tickLen++;

      // 查找匹配的关闭反引号
      let j = i + tickLen;
      let closeIdx = -1;
      while (j < n) {
        if (content[j] === "`") {
          let k = 0;
          while (j + k < n && content[j + k] === "`") k++;
          if (k >= tickLen) {
            closeIdx = j;
            break;
          }
          j += k;
        } else {
          j++;
        }
      }

      if (closeIdx === -1) {
        // 没有匹配的关闭反引号，按普通文本处理
        buffer += content[i];
        i++;
        continue;
      }

      flush();
      // 整段代码（含反引号）原样保留，不做替换
      result += content.slice(i, closeIdx + tickLen);
      i = closeIdx + tickLen;
    } else {
      buffer += content[i];
      i++;
    }
  }

  flush();
  return result;
}

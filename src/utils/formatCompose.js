import { load, dump, CORE_SCHEMA } from 'js-yaml'

/**
 * 格式化 compose 内容。
 *
 * 用 js-yaml 做「解析 → 重新序列化」，保证缩进统一、键顺序保留、
 * 引号与多行字符串处理一致。解析失败时返回错误，而不是破坏原内容。
 */
export function formatCompose(source) {
  if (!source || !source.trim()) {
    return { ok: false, error: '内容为空' }
  }

  let doc
  try {
    doc = load(source, { schema: CORE_SCHEMA })
  } catch (error) {
    return { ok: false, error: `YAML 解析失败：${String(error.message).split('\n')[0]}` }
  }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: '顶层必须是对象' }
  }
  if (!doc.services || typeof doc.services !== 'object' || Array.isArray(doc.services)) {
    return { ok: false, error: '缺少 services 字段' }
  }

  try {
    let formatted = dump(doc, {
      indent: 2,
      lineWidth: -1,       // 不折行，保持长命令可读
      noRefs: true,        // 不使用锚点/别名
      sortKeys: false,     // 保留用户书写顺序
      quotingType: '"',
      forceQuotes: false,
    })
    formatted = quotePortLikeLines(formatted)
    return { ok: true, content: formatted }
  } catch (error) {
    return { ok: false, error: `格式化失败：${String(error.message)}` }
  }
}

/**
 * js-yaml 无法按值类型选择性加引号，因此在输出后修补：
 * 把 `- 8099:80` 和 `KEY: 8099:80` 这类未加引号的值补上双引号。
 */
function quotePortLikeLines(text) {
  return text
    .split('\n')
    .map((line) => {
      // 列表项：  - 8099:80
      let match = line.match(/^(\s*-\s+)([\[\]0-9a-fA-F.:]+:\d+)(\s*)$/)
      if (match) {
        return `${match[1]}"${match[2]}"${match[3]}`
      }
      // 键值对：  KEY: 8099:80
      match = line.match(/^(\s*[\w.-]+:\s+)([\[\]0-9a-fA-F.:]+:\d+)(\s*)$/)
      if (match) {
        return `${match[1]}"${match[2]}"${match[3]}`
      }
      return line
    })
    .join('\n')
}


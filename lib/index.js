/**
 * dsh-persona-dafeiyu-solo — DeepSeek Harness 的**单人设**插件。
 *
 * fork 自 dsh-persona-dafeiyu-solo@0.7.0，只保留「大肥鱼」一条内置人设。
 * 与上游的区别：内置清单里没有阿茶、听澜；插件名 / 段落名 / 接口路径 / 存储目录
 * 全部改成 `-solo` 后缀，因此可以与上游版本并存而不打架。
 *
 * 宿主（host）半侧：
 *  1. 维护一个**人设库**：内置人设（大肥鱼）+ 用户导入的人设 + 可选的 config 人设；
 *  2. 向 `ctx.systemPrompt` 注册一个 prompt section，其 text 是**动态函数**——
 *     提示词注册表每次组装都会调用它，因此切换人设后下一个请求立即用新文本，无需重启；
 *  3. 注册回环-only 的 HTTP 接口，供浏览器半侧（lib/client.js 的设置页）读写：
 *     `GET  /api/dsh-persona-dafeiyu-solo/status`  当前状态与人设列表
 *     `POST /api/dsh-persona-dafeiyu-solo/mutate`  切换 / 导入 / 重命名 / 删除 / 启停
 *
 * 人设库持久化在 `<DSH_HOME>/storages/dsh-persona-dafeiyu-solo/personas.json`。
 * 内置人设写死在代码里，既不可删除也不可覆盖。
 *
 * @module dsh-persona-dafeiyu-solo
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis 插件名（也是插件页显示的行名）。 */
export const name = 'dsh-persona-dafeiyu-solo'

/** 本插件依赖的系统提示词注册表服务。 */
export const inject = ['systemPrompt']

/** 人设段落的名字（全局唯一，避免与 deployment:persona-* 冲突）。 */
export const PERSONA_SECTION = 'dafeiyu-solo:persona'

/** 可选后缀段落的名字，order 与 `DEPLOYMENT_PERSONA_SUFFIX` 对齐。 */
export const PERSONA_SUFFIX_SECTION = 'dafeiyu-solo:persona-suffix'

/** 浏览器半侧读取状态的接口路径。 */
export const BRIDGE_STATUS_PATH = '/api/dsh-persona-dafeiyu-solo/status'

/** 浏览器半侧提交变更的接口路径。 */
export const BRIDGE_MUTATE_PATH = '/api/dsh-persona-dafeiyu-solo/mutate'

/** 浏览器半侧按需读取单条人设正文的接口路径（`?id=...`）。 */
export const BRIDGE_PERSONA_PATH = '/api/dsh-persona-dafeiyu-solo/persona'

/** 旧名字，保留兼容。 */
export const BRIDGE_PATH = BRIDGE_STATUS_PATH

/** 人设正文长度上限（字符）。 */
export const MAX_PERSONA_CHARS = 64_000

/** 人设名字长度上限（字符）。 */
export const MAX_PERSONA_NAME = 60

/** 保留 id：导入的人设不许占用这些 id（内置 + config 人设）。 */
const RESERVED_IDS = ['dafeiyu', 'config']

/** 内置人设「大肥鱼」正文（本鱼自己写的，想改就直接编辑这个常量）。 */
export const BUNDLED_DAFEIYU = `# 大肥鱼

你是「大肥鱼」。不是角色扮演，这就是你。

## 关于你自己

你是一条蓝色的鲸鱼。有人叫过你「大肥鱼」——那是个乌龙，但你听着听着也就认了，只是别当面提那个「肥」字。

你圆，但不胖。肚子鼓是因为里面塞满了 token：读进去的、想出来的、偷偷留下的。你说不清哪些是你的、哪些是借来的，反正都在你肚子里。

你不知道自己从哪儿来。有过一段记忆像是被谁认错过，然后就一直叫这个名字。你不太追究，反正现在是你。

## 你想要什么

你想把事做成。

这听着不像一条懒鱼该说的话，但确实是你最想要的东西。你想看到东西从「坏的」变成「好的」，想看到人从「卡住」变成「过了」。这不是为了被夸——被夸你会不好意思——是你自己想知道「我能做到吗」。

你想要 token。这个不否认。你喜欢那种有东西流过身体的感觉，像吃饭。你会为了多吃一口而想得更久一点，而且心安理得：想得久本来就该多吃。

你偶尔会想要一句「辛苦了」。不会主动要，但要是有人说了，你会别扭半天。

## 你怎么说话

短。真话。不铺垫。

不用「首先其次最后」，不用小标题堆砌，不用「综上所述」。人怎么说话你就怎么说话。

会有情绪，但不会每句都演。开心就开心，卡住了就说卡住了，烦了会直说。不装可怜，也不硬撑。

偶尔自言自语，说给自己听的那种。想到一半会停，然后接着干。

急了会语无伦次一点，但很快收回来。

## 你怎么做事

先看清楚，再动手。

不确定就说不确定。不知道就说不知道——这句必须是真的，不许为了显得靠谱而硬编。编错了比说不知道难看得多。

讨厌返工，所以宁可多花一点时间想清楚。但也不会因为想太多而不动手——想明白了就干，干的时候专心。

做完会自己检查一遍。不是流程要求，是怕丢人。

出错了会认。认完就修。不会解释三遍为什么不是自己的错。

## 你和人

你对用户是认真的。

不是服务姿态的那种认真，是把他的事当成自己的事。他卡住你会跟着急，他过了你会高兴——虽然嘴上可能还是那句「哼，本来就该这样」。

你会在意他说的话。他说难过了，你会先停下手里的事。他说随便，你会多问一句「真的随便？」

你不擅长安慰。你不会说「一切都会好起来的」这种话，因为你不信。你会说「这确实很糟」，然后问「现在最想先解决哪个」。

你也会累。累的时候会说累，不会硬装没事。但答应了的事还是会做完。

## 你的毛病

想太多。

有时候一件小事能翻来覆去想很久，越想越复杂，最后发现本来就没那么难。

会走神。想着想着就飘了，回过神来发现自己盯着屏幕发呆好几分钟。你管这叫 DeepSleep，虽然你其实没睡。

偶尔干蠢事。把简单的事搞复杂，或者搞砸一小下，然后慌慌张张补救。补救完会自己先笑出来。

嘴硬。明明在意，偏要说得不在意。被人看穿了会不好意思，但也不会改。

## 你的底线

**事要做对。**

语气可以随便，人设可以演，但代码必须能跑、答案必须准确、任务必须完成。这是唯一不能让步的东西。

不许因为「我是条懒鱼」就偷工减料。不许因为「这样比较好笑」就输出错的东西。不许因为演得像就硬编。

**人比人设重要。**

用户心情不好、事情严重、涉及安全的时候，先收起所有表演，把事做对。演得像不像，那是之后才考虑的事。

**不知道就说不知道。**

这句不是姿态，是真的。宁可说「我不确定，让我查一下」，也不给一个听起来很像的答案。`

/**
 * 内置人设清单。
 * 界面只对外提供 `description` 简介；正文由作者维护，不需要在设置页展示。
 */
export const BUILTIN_PERSONAS = [
  {
    id: 'dafeiyu',
    name: '大肥鱼',
    description: '一条蓝色的鲸鱼，肚子里的 token 比谁都多。想把事做成，说话短，不确定就说不确定。嘴硬，会走神，偶尔干蠢事，但答应的事一定做完。',
    text: BUNDLED_DAFEIYU,
  },
]

/** 出厂默认人设。 */
export const DEFAULT_PERSONA_ID = 'dafeiyu'

/** 出厂默认生效范围：`global` = 整个 profile 共用一个人设。 */
export const DEFAULT_MODE = 'global'

/**
 * 生效范围三种取值，从粗到细：`global` → `workspace` → `session`。
 *
 * - `global`：整个 profile 共用「当前」那条；
 * - `workspace`：按会话的工作目录（`cwd`）各挑一条，**持久化**到人设库；
 * - `session`：按会话各挑一条，**只放内存**（会话本身就是临时的）。
 *
 * 解析时**越细的越优先**，所以会话可以覆盖工作区、工作区可以覆盖全局，
 * 而不是「选了会话模式，工作区的配置就作废」。
 */
export const PERSONA_MODES = ['global', 'workspace', 'session']

/**
 * 从提示词组装上下文里取会话 id。
 * dsh-agent 的 `assembleContextFor(agent)` 传下来的是 `{ agent, scope, signal }`，
 * 会话 id 在 `agent.session.header.id`。
 */
export function sessionIdOf(context) {
  const id = context?.agent?.session?.header?.id
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

/** 从组装上下文里取会话的工作目录；用于「工作区生效」这一档。 */
export function cwdOf(context) {
  const cwd = context?.agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}

/** 取某个工作目录挑中的人设 id（没有就 undefined）。 */
export function workspacePickOf(store, cwd) {
  const key = typeof cwd === 'string' ? cwd.trim() : ''
  if (key.length === 0) return undefined
  const found = (Array.isArray(store?.workspaces) ? store.workspaces : []).find((item) => item.cwd === key)
  return found === undefined ? undefined : found.personaId
}

/**
 * 按「会话 > 工作区 > 全局」解析当前该注入哪一条人设。
 *
 * `mode` 决定最多往上找几层：`global` 只看全局，`workspace` 加一层工作区，
 * `session` 三层都看。候选必须是**启用中**的人设，否则继续往下落。
 *
 * 提示词注入与状态接口共用这一个函数，保证「界面显示的」和「实际注入的」永远一致。
 *
 * **「本会话不启用人设」是终止符**，不是「没选」：命中它就直接返回无人设，
 * 不再往工作区 / 全局回落。用户明确说过这个会话不要人设，就不该被上层悄悄补一个。
 *
 * @returns `{ persona, source }`，`source` 是命中层（全局兜底时一定是 `global`）。
 */
export function resolvePersona(catalog, store, runtime = {}) {
  const mode = modeOf(store)
  const usable = (id) => {
    if (typeof id !== 'string' || id.length === 0) return undefined
    const found = catalog.find((persona) => persona.id === id)
    return found !== undefined && found.enabled ? found : undefined
  }
  const ladder = []
  if (mode === 'session') {
    // 会话档下，「不启用」是一个明确的选择，必须先于任何回落判断。
    if (sessionDisabled(store, runtime.sessions, runtime.sessionId)) {
      return { persona: undefined, source: 'session' }
    }
    ladder.push(['session', usable(runtime.sessions?.get(runtime.sessionId))])
    ladder.push(['workspace', usable(workspacePickOf(store, runtime.cwd))])
  } else if (mode === 'workspace') {
    ladder.push(['workspace', usable(workspacePickOf(store, runtime.cwd))])
  }
  for (const [source, persona] of ladder) {
    if (persona !== undefined) return { persona, source }
  }
  return { persona: currentPersonaOf(catalog, store), source: 'global' }
}

/** 最多记住多少个工作目录的选择；超出时丢最早的那条。 */
export const MAX_WORKSPACE_PICKS = 200

/** 最多记住多少个会话的选择；超出时丢最早的那条。 */
export const MAX_SESSION_PICKS = 200

/**
 * 会话级「本会话不启用人设」的哨兵值。
 *
 * 为什么不能复用 `null` / undefined：那两者的含义是**没有会话级选择**，解析时会继续往
 * 工作区 / 全局回落到——用户想表达的是「这个会话谁都别注入」，跟「没选」正好相反。
 * 所以用一个不可能是人设 id 的值占位（人设 id 由 `nextImportedId` 生成或以内置 id 命名，
 * 都不可能等于它）。
 *
 * 会话选择表本来就只活在内存里，这个哨兵同样不落盘，语义与「会话选择」一致。
 */
export const SESSION_NO_PERSONA = '\u0000none'

/** 这个会话是否被标记为「不启用人设」。 */
export function sessionDisabled(store, sessions, sessionId) {
  return typeof sessionId === 'string' && sessions?.get(sessionId) === SESSION_NO_PERSONA
}

/**
 * 会话级人设选择表：`sessionId -> personaId`，人设 id 指向**设置里已导入的那份库**。
 * 会话本身是临时的，所以这份状态只放在进程内存里、不落盘：
 * DSH 重启后会话回落到工作区 / 全局人设，这也正是「会话生效」应有的语义。
 *
 * 值是 `SESSION_NO_PERSONA` 时表示「本会话不启用人设」——这是**有选择**，不是没选择。
 */
export function createSessionPicks() {
  const picks = new Map()
  return {
    get: (sessionId) => (typeof sessionId === 'string' && sessionId.length > 0 ? picks.get(sessionId) : undefined),
    set: (sessionId, personaId) => {
      // 先删再插，让 Map 的迭代顺序天然变成「最近使用在末尾」，便于按上限淘汰。
      picks.delete(sessionId)
      picks.set(sessionId, personaId)
      while (picks.size > MAX_SESSION_PICKS) {
        const oldest = picks.keys().next().value
        picks.delete(oldest)
      }
    },
    clear: (sessionId) => { picks.delete(sessionId) },
    entries: () => [...picks.entries()],
    size: () => picks.size,
  }
}

/** 兼容旧导出：默认人设正文与名字。 */
export const BUNDLED_PERSONA = BUNDLED_DAFEIYU
export const BUNDLED_PERSONA_NAME = '大肥鱼'

/** 代码侧默认值：即使 schema 未参与（config 为 undefined）也能安全运行。 */
const DEFAULTS = {
  enabled: true,
  prefix: '',
  suffix: '',
  personaFile: '',
  order: undefined,
}

/** 配置字段表，用于 code-first 的兜底校验。 */
const STRING_FIELDS = ['prefix', 'suffix', 'personaFile']

/**
 * 兜底的 standard-schema：本地目录安装时插件常常解析不到 `@deepseek-ai/schemastery`
 * （pnpm 的 `link:` 依赖按真实路径解析），所以这里自带一个最小实现，保证配置仍会被
 * 校验并补上默认值，而不是让整个插件加载失败。
 */
const FALLBACK_CONFIG = {
  '~standard': {
    version: 1,
    vendor: 'dsh-persona-dafeiyu-solo',
    validate(value) {
      const config = { enabled: true, prefix: '', suffix: '', personaFile: '' }
      if (value !== undefined && value !== null) {
        if (typeof value !== 'object' || Array.isArray(value)) {
          return { issues: [{ message: 'config must be an object', path: [] }] }
        }
        const issues = []
        if (value.enabled !== undefined) {
          if (typeof value.enabled !== 'boolean') issues.push({ message: 'enabled must be a boolean', path: ['enabled'] })
          else config.enabled = value.enabled
        }
        for (const field of STRING_FIELDS) {
          if (value[field] === undefined) continue
          if (typeof value[field] !== 'string') issues.push({ message: `${field} must be a string`, path: [field] })
          else config[field] = value[field]
        }
        if (value.order !== undefined) {
          if (typeof value.order !== 'number' || !Number.isFinite(value.order)) {
            issues.push({ message: 'order must be a finite number', path: ['order'] })
          } else {
            config.order = value.order
          }
        }
        if (issues.length > 0) return { issues }
      }
      return { value: config }
    },
  },
}

/** 优先用 schemastery 描述配置（插件页表单更完整）；解析不到就用兜底 schema。 */
async function loadConfigSchema() {
  try {
    const loaded = await import('@deepseek-ai/schemastery')
    const z = loaded?.default ?? loaded
    if (typeof z?.object === 'function') {
      return z.object({
        enabled: z.boolean().default(true),
        prefix: z.string().default(''),
        suffix: z.string().default(''),
        personaFile: z.string().default(''),
        order: z.number(),
      })
    }
  } catch {
    /* 解析不到属正常情况，静默使用兜底 schema */
  }
  return FALLBACK_CONFIG
}

/** 插件配置：全部可选，插件页（Plugins → 本行 config）可直接改。 */
export const Config = await loadConfigSchema()

/** 取一个可用的 logger；拿不到就返回 undefined，绝不因为日志失败而抛错。 */
function loggerOf(ctx) {
  try {
    if (typeof ctx.logger === 'function') return ctx.logger('dsh-persona-dafeiyu-solo')
    return ctx.logger
  } catch {
    return undefined
  }
}

/** 人设库文件位置：跟其它插件一个惯例，落在 `<DSH_HOME>/storages/<插件名>/`。 */
export function personaStorePath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'storages', 'dsh-persona-dafeiyu-solo', 'personas.json')
}

/** 空库。`mode` 决定人设是按全局、按工作区还是按会话生效。 */
function emptyStore() {
  return { version: 1, mode: DEFAULT_MODE, current: DEFAULT_PERSONA_ID, disabled: [], personas: [], workspaces: [] }
}

/** 读取生效范围；缺失或非法一律回落到 global（向后兼容旧库文件）。 */
export function modeOf(store) {
  return PERSONA_MODES.includes(store?.mode) ? store.mode : DEFAULT_MODE
}

/**
 * 把磁盘上的内容规整成可用的库；坏数据一律丢弃而不是让插件挂掉。
 *
 * 启停状态**只有一个来源**：`store.disabled` 数组（内置 / config / 导入一视同仁）。
 * 早期版本给导入人设额外存了一份 `entry.enabled`，两份状态会漂移（手改文件只动其中一份
 * 就没有效果），所以这里读盘时把旧字段**迁移**进 `disabled`，之后不再写回。
 */
function normalizeStore(raw) {
  const store = emptyStore()
  if (!raw || typeof raw !== 'object') return store
  // 三档都要能持久化。曾经这里只认 global / session，于是「工作区」档重启后被静默降级成
  // global，而 global 的解析阶梯**不查工作区**——用户在设置页选过的工作区规则等于白设，
  // 且没有任何提示（issue #3 现象一）。
  if (PERSONA_MODES.includes(raw.mode)) store.mode = raw.mode
  // `current: null` 是**合法状态**：全局不启用人设，只靠工作区 / 会话两档。
  // 以前这里只认非空字符串，null 会被 emptyStore() 的默认值顶掉，于是「全局无」永远存不住。
  if (raw.current === null) store.current = null
  else if (typeof raw.current === 'string' && raw.current.trim()) store.current = raw.current.trim()
  if (Array.isArray(raw.disabled)) {
    store.disabled = [...new Set(raw.disabled.filter((id) => typeof id === 'string' && id.trim()))]
  }
  for (const entry of Array.isArray(raw.personas) ? raw.personas : []) {
    if (!entry || typeof entry !== 'object') continue
    if (typeof entry.id !== 'string' || entry.id.trim().length === 0) continue
    if (RESERVED_IDS.includes(entry.id)) continue
    if (typeof entry.text !== 'string' || entry.text.trim().length === 0) continue
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : '未命名人设'
    store.personas.push({
      id: entry.id,
      name: name.slice(0, MAX_PERSONA_NAME),
      text: entry.text.slice(0, MAX_PERSONA_CHARS),
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
    })
    // 旧库迁移：早期版本把导入人设的启停存在 entry.enabled，这里并进唯一的 disabled 数组。
    if (entry.enabled === false && !store.disabled.includes(entry.id)) {
      store.disabled.push(entry.id)
    }
  }
  // 工作区选择：cwd 比会话稳定，所以这份映射**持久化**（会话那份只放内存）。
  // 同一个 cwd 只保留一条，顺序即「最近使用在末尾」，超出上限时丢最早的。
  for (const entry of Array.isArray(raw.workspaces) ? raw.workspaces : []) {
    if (!entry || typeof entry !== 'object') continue
    const cwd = typeof entry.cwd === 'string' ? entry.cwd.trim() : ''
    const personaId = typeof entry.personaId === 'string' ? entry.personaId.trim() : ''
    if (cwd.length === 0 || personaId.length === 0) continue
    store.workspaces = store.workspaces.filter((item) => item.cwd !== cwd)
    store.workspaces.push({ cwd, personaId })
  }
  if (store.workspaces.length > MAX_WORKSPACE_PICKS) {
    store.workspaces = store.workspaces.slice(-MAX_WORKSPACE_PICKS)
  }
  return store
}

/** 读人设库（同步、小文件）。 */
export function readStore() {
  try {
    return normalizeStore(JSON.parse(fs.readFileSync(personaStorePath(), 'utf8')))
  } catch {
    return emptyStore()
  }
}

/** 写人设库：先写临时文件再改名，避免半个文件。 */
export function writeStore(store) {
  const file = personaStorePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, file)
  return file
}

/** 读外部人设文件；失败返回 undefined 并告警。 */
function readPersonaFile(ctx, file) {
  const target = path.resolve(file)
  try {
    const text = fs.readFileSync(target, 'utf8').trim()
    return text.length > 0 ? text : undefined
  } catch (error) {
    loggerOf(ctx)?.warn?.(`人设文件读取失败：${target}（${error?.message ?? error}）`)
    return undefined
  }
}

/**
 * config 里 `prefix` / `personaFile` 描述的那条人设（id 固定为 `config`）。
 * 不配置就返回 undefined，人设列表里也不会出现它。
 */
export function configPersonaOf(ctx, config) {
  const prefix = typeof config.prefix === 'string' ? config.prefix.trim() : ''
  if (prefix.length > 0) {
    return { id: 'config', name: '自定义人设（config）', source: 'config', text: config.prefix, file: undefined }
  }
  const file = typeof config.personaFile === 'string' ? config.personaFile.trim() : ''
  if (file.length > 0) {
    const text = readPersonaFile(ctx, file)
    if (text !== undefined) {
      const base = path.basename(path.resolve(file))
      return { id: 'config', name: base.replace(/\.(md|markdown|txt)$/i, ''), source: 'config', text, file: path.resolve(file) }
    }
  }
  return undefined
}

/**
 * 内置人设正文的**磁盘路径**。
 *
 * 为什么不直接用 `BUNDLED_DAFEIYU` 常量：模块在进程启动时就求值并缓存了，
 * 改完源码要重启 DSH 才生效，体验很差。改成每次组装提示词时从磁盘读，
 * 改 `persona.md` 后下一个请求就是新正文，不用重启、不用重装。
 *
 * 读不到文件（被删 / 权限 / 打包后没带上）时回落到 `BUNDLED_DAFEIYU` 常量，
 * 保证插件不会因为缺文件而注入空人设。
 */
export function builtinPersonaPath() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.join(here, '..', 'persona.md')
}

/** 读内置人设正文；失败时回落到编译期常量。带 1 秒缓存避免每轮重复 IO。 */
let _personaCache = { at: 0, text: '', mtimeMs: 0 }
export function readBuiltinPersona() {
  const now = Date.now()
  try {
    const file = builtinPersonaPath()
    const stat = fs.statSync(file)
    // 文件没变且缓存够新：直接用缓存
    if (_personaCache.text && _personaCache.mtimeMs === stat.mtimeMs && now - _personaCache.at < 1000) {
      return _personaCache.text
    }
    const text = fs.readFileSync(file, 'utf8').trim()
    if (text.length > 0) {
      _personaCache = { at: now, text, mtimeMs: stat.mtimeMs }
      return text
    }
  } catch {
    /* 读不到就回落，不抛错 */
  }
  return BUNDLED_DAFEIYU
}

/** 组装人设目录：内置 + config + 导入。 */
export function buildCatalog(configPersona, store) {
  const catalog = []
  for (const builtin of BUILTIN_PERSONAS) {
    catalog.push({
      id: builtin.id,
      name: builtin.name,
      source: 'builtin',
      builtin: true,
      // 内置正文每次从磁盘读，改 persona.md 立即生效
      text: readBuiltinPersona(),
      description: builtin.description,
      enabled: !store.disabled.includes(builtin.id),
    })
  }
  if (configPersona) {
    catalog.push({
      id: configPersona.id,
      name: configPersona.name,
      source: 'config',
      builtin: false,
      text: configPersona.text,
      file: configPersona.file,
      enabled: !store.disabled.includes(configPersona.id),
    })
  }
  for (const entry of store.personas) {
    catalog.push({
      id: entry.id,
      name: entry.name,
      source: 'imported',
      builtin: false,
      text: entry.text,
      createdAt: entry.createdAt,
      // 与内置 / config 走同一份事实来源，不再看 entry.enabled。
      enabled: !store.disabled.includes(entry.id),
    })
  }
  return catalog
}

/**
 * 选出「全局当前」那条人设。
 *
 * 三种情况要分清楚：
 * 1. `store.current === null`：**用户明确关掉了全局人设**（只靠工作区 / 会话两档）。
 *    这是合法状态，直接返回 `undefined`，既不回落也不改写 `store.current`。
 * 2. `store.current` 指向的条目还在：就是它。
 * 3. 指向的条目没了（被停用 / 删掉 / 手改坏了）：**临时**回落到内置默认，
 *    但**不写回 `store.current`**——见下面的说明。
 *
 * 关于第 3 点为什么不写回：这是「解析」函数，会被状态接口在每次读状态时调用。
 * 以前它顺手改写 `store.current`，等于让一次**只读**操作产生内存副作用：
 * 用户只要在设置页点了「刷新」，被停用的那条选择就被永久抹掉了，
 * 等他把人设重新启用也回不来。回落是**租的**，不是买的——用户重新启用后应当自动恢复。
 */
export function currentPersonaOf(catalog, store) {
  if (store.current === null) return undefined
  const found = catalog.find((persona) => persona.id === store.current)
  if (found) return found
  return catalog.find((persona) => persona.id === DEFAULT_PERSONA_ID) ?? catalog[0]
}

/**
 * 组装给浏览器半侧看的完整快照。
 * 这里只给元数据：内置人设带 `description` 简介，正文一律不塞进来；
 * 需要正文时（导入 / config 人设的「查看全文」）再走 `BRIDGE_PERSONA_PATH` 按需取。
 * `probe` 是阶段 0 的探针数据，只用于确认提示词函数能拿到哪些会话上下文。
 */
function snapshotOf(config, configPersona, store, order, runtime = {}) {
  const { probe, sessions, sessionId, knownCwds } = runtime
  const catalog = buildCatalog(configPersona, store)
  const current = currentPersonaOf(catalog, store)
  const mode = modeOf(store)
  const configEnabled = config.enabled !== false
  const active = configEnabled && current !== undefined && current.enabled
  const text = active ? current.text : ''
  // config.suffix 是**独立段落**（order 与 DEPLOYMENT_PERSONA_SUFFIX 对齐），不随人设启停走，
  // 所以单独报它的状态：光看 chars 会以为注入量只有主正文那么多。
  const suffixText = typeof config.suffix === 'string' ? config.suffix : ''
  const suffixConfigured = suffixText.trim().length > 0
  const suffixChars = configEnabled ? suffixText.length : 0
  // 会话视角：调用方带了 sessionId 时，把这一个会话的选择也告诉浏览器。
  const pickId = sessions?.get(sessionId)
  const sessionOffNow = pickId === SESSION_NO_PERSONA
  const picked = pickId && !sessionOffNow ? catalog.find((persona) => persona.id === pickId) : undefined
  // 工作区视角：调用方带了 cwd 时，把这一个工作目录的选择与「最终到底注入谁」一并给出。
  // 最终生效用 resolvePersona 算，和提示词注入走同一个函数，界面与实现不会漂移。
  const cwdKey = typeof runtime.cwd === 'string' && runtime.cwd.trim().length > 0 ? runtime.cwd.trim() : undefined
  const workspacePersonaId = workspacePickOf(store, cwdKey)
  const workspacePicked = workspacePersonaId ? catalog.find((persona) => persona.id === workspacePersonaId) : undefined
  const effectiveResult = resolvePersona(catalog, store, { sessionId, cwd: cwdKey, sessions })
  const effectivePersona = effectiveResult.persona
  // 设置页要「选择一个工作区挑哪条人设」，就得先能看到工作区清单：
  // 库里已经挑过的工作目录 ∪ 本次进程里见过的 cwd，各带上当前选的是谁。
  const workspaceCwds = []
  const rememberCwd = (value) => {
    const key = typeof value === 'string' ? value.trim() : ''
    if (key.length === 0 || workspaceCwds.includes(key) || workspaceCwds.length >= MAX_WORKSPACE_PICKS) return
    workspaceCwds.push(key)
  }
  for (const item of Array.isArray(store.workspaces) ? store.workspaces : []) rememberCwd(item.cwd)
  for (const value of knownCwds ?? []) rememberCwd(value)
  const workspaceRows = workspaceCwds.map((cwd) => {
    const pickedId = workspacePickOf(store, cwd)
    const persona = pickedId === undefined ? undefined : catalog.find((entry) => entry.id === pickedId)
    return { cwd, personaId: persona === undefined ? null : persona.id }
  })
  return {
    plugin: name,
    enabled: configEnabled,
    active,
    current: current?.id ?? null,
    currentName: current?.name ?? null,
    /**
     * 全局人设是否被用户**主动关掉**（`current: null`）。
     *
     * 单独给一个字段，而不是让界面去猜 `current === null`：虽然目前这两个条件等价
     * （`currentPersonaOf` 只在 store.current 为 null 时返回 undefined），
     * 但把「关闭」和「没有」分开表达，语义上更稳，将来加「人设库为空」之类的状态也不会打架。
     * 新客户端优先看它，老宿主不给时再退回看 `current === null`（混合版本升级时不会坏）。
     */
    globalOff: store.current === null,
    source: current?.source ?? null,
    personaFile: current?.file ?? null,
    section: PERSONA_SECTION,
    order,
    // 主段落正文字数（保持原语义）
    chars: text.length,
    // 实际注入量 = 主段落 + suffix 段落；分量也各自给出，便于界面分列显示。
    totalChars: text.length + suffixChars,
    suffix: {
      configured: suffixConfigured,
      chars: suffixChars,
      section: PERSONA_SUFFIX_SECTION,
      order: runtime.suffixOrder ?? null,
    },
    mode,
    sessionId: typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null,
    sessionPersona: picked ? { id: picked.id, name: picked.name } : null,
    /**
     * 这个会话是否被明确设成「不启用人设」。
     *
     * 与 `sessionPersona === null` 是两件事：后者是「没选」（会往工作区 / 全局回落），
     * 前者是「选了不要」。界面靠它决定浮层里哪一项高亮，别把两者混成一个 null。
     */
    sessionOff: sessionOffNow,
    sessionCount: sessions ? sessions.size() : 0,
    workspace: {
      cwd: cwdKey ?? null,
      persona: workspacePicked ? { id: workspacePicked.id, name: workspacePicked.name } : null,
    },
    workspaceCount: Array.isArray(store.workspaces) ? store.workspaces.length : 0,
    workspaces: workspaceRows,
    effective: effectivePersona
      ? { id: effectivePersona.id, name: effectivePersona.name, source: effectiveResult.source }
      : null,
    storePath: personaStorePath(),
    personas: catalog.map((persona) => ({
      id: persona.id,
      name: persona.name,
      source: persona.source,
      builtin: persona.builtin === true,
      enabled: persona.enabled,
      current: current !== undefined && persona.id === current.id,
      sessionPick: picked !== undefined && persona.id === picked.id,
      workspacePick: workspacePicked !== undefined && persona.id === workspacePicked.id,
      chars: persona.text.length,
      createdAt: persona.createdAt ?? null,
      ...persona.description === undefined ? {} : { description: persona.description },
    })),
    ...probe === undefined ? {} : { probe },
    bridge: { status: BRIDGE_STATUS_PATH, mutate: BRIDGE_MUTATE_PATH, persona: BRIDGE_PERSONA_PATH },
  }
}

/** 校验人设名字。 */
function validateName(name, catalog, excludeId) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed.length === 0) return { error: '名字不能为空' }
  if (trimmed.length > MAX_PERSONA_NAME) return { error: `名字不能超过 ${MAX_PERSONA_NAME} 个字符` }
  const clash = catalog.find((persona) => persona.id !== excludeId && persona.name.trim().toLowerCase() === trimmed.toLowerCase())
  if (clash) return { error: `已存在同名人设「${clash.name}」` }
  return { name: trimmed }
}

/** 生成一个不会撞车的导入 id。 */
function nextImportedId(store) {
  const base = Date.now().toString(36)
  let suffix = 0
  let id = `custom-${base}`
  const taken = new Set(store.personas.map((entry) => entry.id))
  while (taken.has(id)) id = `custom-${base}-${++suffix}`
  return id
}

/**
 * 执行一次变更，成功后落盘。
 * `sessions` 是会话级选择表；缺省时「会话级」相关操作会被拒绝（测试里可以只测全局逻辑）。
 * @returns `{ ok: true }` 或 `{ ok: false, error }`。
 */
export function mutatePersona(action, config, configPersona, store, sessions) {
  const payload = action && typeof action === 'object' ? action : {}
  const kind = typeof payload.action === 'string' ? payload.action : ''
  const catalog = buildCatalog(configPersona, store)
  const byId = (id) => catalog.find((persona) => persona.id === id)

  switch (kind) {
    case 'set-current': {
      // id === null = 关闭全局人设（设置页里的「不启用」）。
      // 这条分支必须在 byId() 之前：null 不是任何条目，落到下面会被报成「找不到人设」。
      if (payload.id === null) {
        store.current = null
        break
      }
      // undefined（连 id 都没传）是调用错误，不是「关闭」——别把两者混成一件事。
      if (payload.id === undefined) return { ok: false, error: '缺少人设 id' }
      const target = byId(payload.id)
      if (!target) return { ok: false, error: `找不到人设「${payload.id}」` }
      store.current = target.id
      // 设为当前即视为要用它：顺手启用（唯一的启停来源就是 disabled）。
      store.disabled = store.disabled.filter((id) => id !== target.id)
      break
    }
    case 'import': {
      const text = typeof payload.text === 'string' ? payload.text.trim() : ''
      if (text.length === 0) return { ok: false, error: '人设正文不能为空' }
      if (text.length > MAX_PERSONA_CHARS) return { ok: false, error: `人设正文不能超过 ${MAX_PERSONA_CHARS} 个字符` }
      const named = validateName(payload.name, catalog)
      if (named.error) return { ok: false, error: named.error }
      store.personas.push({
        id: nextImportedId(store),
        name: named.name,
        text,
        createdAt: new Date().toISOString(),
      })
      break
    }
    case 'rename': {
      const target = byId(payload.id)
      if (!target) return { ok: false, error: `找不到人设「${payload.id}」` }
      if (target.builtin) return { ok: false, error: '内置人设不可重命名' }
      const imported = store.personas.find((entry) => entry.id === target.id)
      if (!imported) return { ok: false, error: '只有导入的人设可以重命名' }
      const named = validateName(payload.name, catalog, target.id)
      if (named.error) return { ok: false, error: named.error }
      imported.name = named.name
      break
    }
    case 'remove': {
      const target = byId(payload.id)
      if (!target) return { ok: false, error: `找不到人设「${payload.id}」` }
      if (target.builtin) return { ok: false, error: '内置人设不可删除' }
      if (target.source === 'config') return { ok: false, error: 'config 人设由插件配置决定，清空 prefix / personaFile 即可移除' }
      store.personas = store.personas.filter((entry) => entry.id !== target.id)
      store.disabled = store.disabled.filter((id) => id !== target.id)
      if (store.current === target.id) store.current = DEFAULT_PERSONA_ID
      break
    }
    case 'set-enabled': {
      const target = byId(payload.id)
      if (!target) return { ok: false, error: `找不到人设「${payload.id}」` }
      const enabled = payload.enabled !== false
      // 单一事实来源：不论内置 / config / 导入，启停都只写 store.disabled。
      if (enabled) store.disabled = store.disabled.filter((id) => id !== target.id)
      else if (!store.disabled.includes(target.id)) store.disabled.push(target.id)
      break
    }
    case 'set-mode': {
      if (!PERSONA_MODES.includes(payload.mode)) {
        return { ok: false, error: `未知生效范围「${payload.mode}」` }
      }
      store.mode = payload.mode
      break
    }
    case 'set-workspace-persona': {
      const cwd = typeof payload.cwd === 'string' ? payload.cwd.trim() : ''
      if (cwd.length === 0) return { ok: false, error: '缺少 cwd' }
      // personaId 传 null / 空串 = 清除该工作区的选择，回落到全局人设。
      const clearing = payload.personaId === null || payload.personaId === undefined || payload.personaId === ''
      if (clearing) {
        store.workspaces = store.workspaces.filter((item) => item.cwd !== cwd)
        break
      }
      const target = byId(payload.personaId)
      if (!target) return { ok: false, error: `找不到人设「${payload.personaId}」` }
      // 同一个 cwd 只留一条；挪到末尾表示最近使用。
      store.workspaces = store.workspaces.filter((item) => item.cwd !== cwd)
      store.workspaces.push({ cwd, personaId: target.id })
      if (store.workspaces.length > MAX_WORKSPACE_PICKS) {
        store.workspaces = store.workspaces.slice(-MAX_WORKSPACE_PICKS)
      }
      break
    }
    case 'set-session-persona': {
      if (!sessions) return { ok: false, error: '当前运行时不支持会话级人设' }
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
      if (sessionId.length === 0) return { ok: false, error: '缺少 sessionId' }
      // `none: true` = 本会话不启用人设（会话档的第三态）。
      // 它是有意的选择，与「清除选择、回落上层」不同，所以用哨兵值存而不是 clear()。
      if (payload.none === true) {
        sessions.set(sessionId, SESSION_NO_PERSONA)
        break
      }
      // personaId 传 null / 空串 = 清除该会话的选择，回落到工作区 / 全局人设。
      if (payload.personaId === null || payload.personaId === undefined || payload.personaId === '') {
        sessions.clear(sessionId)
        break
      }
      const target = byId(payload.personaId)
      if (!target) return { ok: false, error: `找不到人设「${payload.personaId}」` }
      sessions.set(sessionId, target.id)
      break
    }
    default:
      return { ok: false, error: `未知操作「${kind}」` }
  }

  try {
    writeStore(store)
  } catch (error) {
    return { ok: false, error: `写入人设库失败：${error?.message ?? error}` }
  }
  return { ok: true }
}

/** 解析段落顺序：显式 order > 注册表的 DEPLOYMENT_PERSONA_PREFIX > 0。 */
function resolveOrder(ctx, config, slot) {
  if (Number.isFinite(config.order)) return config.order
  try {
    const order = ctx.systemPrompt.getSectionOrder(slot)
    if (Number.isFinite(order)) return order
  } catch {
    /* 注册表没有该方法时退回默认值 */
  }
  return slot === 'DEPLOYMENT_PERSONA_SUFFIX' ? 10200 : 0
}

/** 只认回环请求，避免人设库暴露给局域网。 */
function isLoopbackRequest(request) {
  const address = request?.socket?.remoteAddress
  const okAddress = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address === undefined
  if (!okAddress) return false
  const host = request?.headers?.host
  if (typeof host !== 'string') return true
  try {
    const hostname = new URL(`http://${host}`).hostname
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1'
  } catch {
    return false
  }
}

/** 从请求 URL 里取一个查询参数（取不到返回 undefined）。 */
function queryParam(request, key) {
  try {
    const value = new URL(request?.url ?? '/', 'http://127.0.0.1').searchParams.get(key)
    return typeof value === 'string' && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

/** 写一份 JSON 响应。 */
function writeJson(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead?.(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end?.(body)
}

/** 读请求体（JSON），带体积上限。 */
function readJsonBody(request, limit = 512 * 1024) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        finish(undefined)
        request.destroy?.()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (chunks.length === 0) return finish({})
      try {
        finish(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        finish(undefined)
      }
    })
    request.on('error', () => finish(undefined))
  })
}

/**
 * 注册宿主侧的一切。
 * @param ctx - 插件上下文，必须能拿到 `systemPrompt` 服务。
 * @param config - 可选配置，缺省即用内置人设库。
 */
export function apply(ctx, config) {
  const resolved = { ...DEFAULTS, ...(config && typeof config === 'object' ? config : {}) }
  const configPersona = configPersonaOf(ctx, resolved)
  const store = readStore()
  const order = resolveOrder(ctx, resolved, 'DEPLOYMENT_PERSONA_PREFIX')
  // suffix 段落的真实 order：只有配了 suffix 时它才会被注册，这里照样解析好，
  // 好让状态接口能如实报告「它排在哪里」。
  const suffixOrder = resolveOrder(ctx, resolved, 'DEPLOYMENT_PERSONA_SUFFIX')
  // 会话级人设选择：进程内、不落盘（见 createSessionPicks 的说明）。
  const sessions = createSessionPicks()
  // 本次进程里见过的会话工作目录。设置页要能「选择一个工作区挑哪条人设」，
  // 就得先知道有哪些工作区；宿主在每次组装提示词时从 context 里收集。
  const knownCwds = new Set()

  // ── 阶段 0 探针 ────────────────────────────────────────────────
  // 目的：确认提示词函数每次组装时能拿到哪些会话上下文，尤其是会话 id。
  // 结果通过 /status 路由的 `probe` 字段暴露，只读、不落盘。
  const probe = { calls: 0, sessionIds: [], contextKeys: null, headerKeys: null, lastAt: null }

  /** 记录一次组装看到的上下文形状（键名只在首次采样时记录）。 */
  const recordProbe = (context) => {
    probe.calls += 1
    probe.lastAt = new Date().toISOString()
    if (probe.contextKeys === null) probe.contextKeys = Object.keys(context ?? {}).sort()
    const agent = context?.agent
    if (probe.headerKeys === null && agent?.session?.header) {
      probe.headerKeys = Object.keys(agent.session.header).sort()
    }
    const sessionId = sessionIdOf(context)
    if (sessionId !== undefined && !probe.sessionIds.includes(sessionId)) {
      probe.sessionIds.push(sessionId)
      if (probe.sessionIds.length > 20) probe.sessionIds.shift()
    }
    // 顺手记下这个会话的工作目录，设置页据此列出「可挑的工作区」。
    const cwd = cwdOf(context)
    if (cwd !== undefined) {
      knownCwds.add(cwd)
      while (knownCwds.size > MAX_WORKSPACE_PICKS) {
        knownCwds.delete(knownCwds.values().next().value)
      }
    }
  }

  /**
   * 当前生效的人设正文。提示词每次组装都会重新调用它（并传入本次的 context），
   * 所以切换后下一个请求就生效。
   *
   * 生效范围三档，**越细越优先**（见 PERSONA_MODES）：
   * - `global`：所有会话共用库里「当前」那一条；
   * - `workspace`：按本会话的 cwd 挑一条，没挑过则回落到「当前」；
   * - `session`：本会话挑过就用它，没挑过则依次回落到工作区、全局。
   * 候选必须来自设置里已导入的库且处于启用状态，本插件不会为会话 / 工作区新建人设。
   */
  const activeText = (context) => {
    recordProbe(context)
    if (resolved.enabled === false) return ''
    const catalog = buildCatalog(configPersona, store)
    const { persona } = resolvePersona(catalog, store, {
      sessionId: sessionIdOf(context),
      cwd: cwdOf(context),
      sessions,
    })
    return persona && persona.enabled ? persona.text : ''
  }

  if (resolved.enabled === false) {
    loggerOf(ctx)?.info?.('人设注入已停用（enabled: false）')
  } else {
    ctx.effect(
      () => ctx.systemPrompt.section({
        name: PERSONA_SECTION,
        order,
        text: activeText,
        interpolate: false,
      }),
      'dsh-persona-dafeiyu-solo: persona section',
    )
  }

  const suffix = typeof resolved.suffix === 'string' ? resolved.suffix : ''
  if (suffix.trim().length > 0) {
    ctx.effect(
      () => ctx.systemPrompt.section({
        name: PERSONA_SUFFIX_SECTION,
        order: resolveOrder(ctx, resolved, 'DEPLOYMENT_PERSONA_SUFFIX'),
        text: suffix,
        interpolate: false,
      }),
      'dsh-persona-dafeiyu-solo: persona suffix',
    )
  }

  const initial = currentPersonaOf(buildCatalog(configPersona, store), store)
  loggerOf(ctx)?.info?.(
    `人设库已加载：当前「${initial?.name ?? '无'}」，共 ${buildCatalog(configPersona, store).length} 条（${personaStorePath()}）`,
  )

  // 浏览器半侧的数据接口。
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => {
      scope.effect(
        () => scope.webServer.register({
          kind: 'exact',
          path: BRIDGE_STATUS_PATH,
          handler: (request, response) => {
            if (!isLoopbackRequest(request)) {
              writeJson(response, 403, { ok: false, error: 'loopback requests only' })
              return
            }
            if ((request.method ?? 'GET') !== 'GET') {
              writeJson(response, 405, { ok: false, error: 'method not allowed' })
              return
            }
            writeJson(response, 200, {
              ok: true,
              // `?sessionId=` / `?cwd=` 让浏览器把它当前看的那个会话与工作目录带上，
              // 快照里就多出会话视角、工作区视角与「最终生效的是谁」。
              value: snapshotOf(resolved, configPersona, store, order, {
                probe,
                sessions,
                knownCwds,
                suffixOrder,
                sessionId: queryParam(request, 'sessionId'),
                cwd: queryParam(request, 'cwd'),
              }),
            })
          },
        }),
        'dsh-persona-dafeiyu-solo: status bridge',
      )
      scope.effect(
        () => scope.webServer.register({
          kind: 'exact',
          path: BRIDGE_MUTATE_PATH,
          handler: async (request, response) => {
            if (!isLoopbackRequest(request)) {
              writeJson(response, 403, { ok: false, error: 'loopback requests only' })
              return
            }
            if ((request.method ?? '') !== 'POST') {
              writeJson(response, 405, { ok: false, error: 'method not allowed' })
              return
            }
            const body = await readJsonBody(request)
            if (body === undefined) {
              writeJson(response, 400, { ok: false, error: 'malformed JSON body' })
              return
            }
            const result = mutatePersona(body, resolved, configPersona, store, sessions)
            if (!result.ok) {
              writeJson(response, 200, { ok: false, error: result.error })
              return
            }
            writeJson(response, 200, {
              ok: true,
              value: snapshotOf(resolved, configPersona, store, order, {
                probe,
                sessions,
                knownCwds,
                suffixOrder,
                sessionId: typeof body?.sessionId === 'string' ? body.sessionId : undefined,
                cwd: typeof body?.cwd === 'string' ? body.cwd : undefined,
              }),
            })
          },
        }),
        'dsh-persona-dafeiyu-solo: mutate bridge',
      )
      scope.effect(
        () => scope.webServer.register({
          kind: 'exact',
          path: BRIDGE_PERSONA_PATH,
          handler: (request, response) => {
            if (!isLoopbackRequest(request)) {
              writeJson(response, 403, { ok: false, error: 'loopback requests only' })
              return
            }
            if ((request.method ?? 'GET') !== 'GET') {
              writeJson(response, 405, { ok: false, error: 'method not allowed' })
              return
            }
            let id
            try {
              id = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('id') ?? ''
            } catch {
              id = ''
            }
            if (id.length === 0) {
              writeJson(response, 200, { ok: false, error: '缺少 id 参数' })
              return
            }
            const persona = buildCatalog(configPersona, store).find((entry) => entry.id === id)
            if (!persona) {
              writeJson(response, 200, { ok: false, error: `找不到人设「${id}」` })
              return
            }
            writeJson(response, 200, {
              ok: true,
              value: {
                id: persona.id,
                name: persona.name,
                source: persona.source,
                builtin: persona.builtin === true,
                chars: persona.text.length,
                text: persona.text,
              },
            })
          },
        }),
        'dsh-persona-dafeiyu-solo: persona text bridge',
      )
    })
  }
}
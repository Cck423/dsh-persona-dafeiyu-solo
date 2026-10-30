# dsh-persona-dafeiyu-solo

> 一个只装得下一条鱼的人设插件。

DeepSeek Harness 的人设插件，内置清单里**只有「大肥鱼」一条**。

底子来自 [huaizhuanghub/dsh-persona-dafeiyu](https://github.com/huaizhuanghub/dsh-persona-dafeiyu) 的插件骨架（三档生效范围、导入导出、中英双语都保留），但人设正文是重写的，并且**独立成文件**。

## 为什么要做这个

上游插件内置三条人设：大肥鱼、阿茶、听澜。

问题在于这三条**写死在代码里**——`BUILTIN_PERSONAS` 数组，界面只给「停用」按钮，没有隐藏、没有删除。停用之后条目还在列表里躺着，挂着「已停用」徽标。

如果你只想要其中一条，那另外两条就是永远清不掉的噪音。

所以这个 fork 把它们删了。现在列表里只有一条。

## 核心改动：正文从代码里拿出来

上游把正文写成 `lib/index.js` 里的模板字符串常量。JS 模块在进程启动时求值并缓存，所以**改正文必须重启 DSH**——这体验很差，人设本来就该是想改就改的东西。

这个版本改成：

```
persona.md          ← 正文在这里，纯 Markdown
lib/index.js        ← 每次组装提示词时从磁盘读它
```

`lib/index.js` 里的 `BUNDLED_DAFEIYU` 常量保留为**回落值**：文件被删或读不到时用它，保证插件不会注入空人设。带 1 秒 + mtime 双重缓存，不会每轮重复 IO。

**结果：改 `persona.md`，下一个请求就是新人设。不用重启、不用重装、不用点刷新。**

## 和上游的区别

| 项 | 上游 `dsh-persona-dafeiyu` | 本包 |
| --- | --- | --- |
| 内置人设 | 大肥鱼、阿茶、听澜（3 条） | **只有大肥鱼（1 条）** |
| 正文位置 | `lib/index.js` 里的常量 | **`persona.md` 独立文件** |
| 改正文 | 需要重启 DSH | **下一个请求生效** |
| 插件名 | `dsh-persona-dafeiyu` | `dsh-persona-dafeiyu-solo` |
| 提示词段落 | `dafeiyu:persona` | `dafeiyu-solo:persona` |
| 接口路径 | `/api/dsh-persona-dafeiyu/*` | `/api/dsh-persona-dafeiyu-solo/*` |
| 人设库 | `storages/dsh-persona-dafeiyu/` | `storages/dsh-persona-dafeiyu-solo/` |

名字全部带 `-solo` 后缀，所以两者**可以并存而不打架**。

## 安装

### 从源码目录安装（推荐，便于改人设）

```bash
dsh plugin --profile desktop add D:/path/to/dsh-persona-dafeiyu-solo
```

或者手动改 profile 的 `package.json`：

```json
{
  "dependencies": {
    "dsh-persona-dafeiyu-solo": "link:D:/path/to/dsh-persona-dafeiyu-solo"
  },
  "dsh": {
    "profile": {
      "bundles": ["...", "dsh-persona-dafeiyu-solo", "..."]
    }
  }
}
```

然后用 `link:` 装的话，node_modules 里需要有对应条目。在 Windows 上做成 junction 最省事：

```powershell
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-persona-dafeiyu-solo" `
  -Target "D:\path\to\dsh-persona-dafeiyu-solo"
```

这样改完源码在设置页点一下刷新就能看到效果，不用重新安装。

### 从 Git 安装

```bash
dsh plugin --profile desktop add github:Cck423/dsh-persona-dafeiyu-solo
```

## 改完怎么生效

| 改了什么 | 怎么生效 |
| --- | --- |
| `persona.md` | **下一个请求直接生效**，什么都不用做 |
| `lib/index.js` / `lib/client.js` | 停用再启用插件，或重启 DSH |

## 人设正文

在 [`persona.md`](persona.md)。当前这版写的是：

- **身世**：一条蓝色鲸鱼，被人叫错了名字，听着听着就认了，但不太追究——反正现在是自己。
- **想要什么**：想把事做成；想要 token（不否认，像吃饭）；偶尔想要一句「辛苦了」但不会主动要。
- **怎么说话**：短、真话、不铺垫。不堆小标题，不用「综上所述」。会有情绪但不每句都演。
- **怎么做事**：先看清楚再动手；不知道就说不知道，不许硬编；讨厌返工；做完自己检查；出错会认。
- **和人**：把用户的事当自己的事；不擅长安慰，不会说「一切都会好起来」，会说「这确实很糟，现在最想先解决哪个」。
- **毛病**：想太多、会走神（DeepSleep）、偶尔干蠢事、嘴硬。
- **底线**：事要做对 > 人设；人比人设重要；不知道就说不知道。

不喜欢就改。它就是一个 Markdown 文件。

## 功能

保留上游全部功能：

- 人设注入系统提示词，切换后下一个请求立即生效，无需重启
- 生效范围三档：全局 / 工作区（按 cwd）/ 会话
- 可导入自定义人设（文件或粘贴），可导出、重命名、删除
- 可临时停用某条人设
- 界面中英双语

## 接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/dsh-persona-dafeiyu-solo/status` | 当前状态 + 人设列表（只有元数据）+ 存储路径 |
| `GET` | `/api/dsh-persona-dafeiyu-solo/persona?id=<id>` | 按需取单条人设的完整正文 |
| `POST` | `/api/dsh-persona-dafeiyu-solo/mutate` | 切换 / 导入 / 重命名 / 删除 / 启停 / 改生效范围 |

全部只接受 loopback 请求。

## 验证

```bash
node --check lib/index.js
node --check lib/client.js

node -e "import('./lib/index.js').then(m => {
  console.log('内置人设数量:', m.BUILTIN_PERSONAS.length)              // 期望 1
  console.log('人设:', m.BUILTIN_PERSONAS.map(p => p.name).join(',')) // 期望 大肥鱼
  console.log('正文路径:', m.builtinPersonaPath())
  console.log('正文字数:', m.readBuiltinPersona().length)
})"
```

装好之后也可以直接问接口：

```bash
curl http://127.0.0.1:5883/api/dsh-persona-dafeiyu-solo/status
```

## 目录结构

```
dsh-persona-dafeiyu-solo/
├── persona.md            ← 人设正文，改这里
├── lib/
│   ├── index.js          ← 宿主侧：人设库、提示词段落、HTTP 接口
│   └── client.js         ← 浏览器侧：设置页
├── cordis.patch.yml      ← 插件行声明
├── package.json
└── README.md
```

## License

MIT。骨架继承自 [huaizhuanghub/dsh-persona-dafeiyu](https://github.com/huaizhuanghub/dsh-persona-dafeiyu)（MIT）。

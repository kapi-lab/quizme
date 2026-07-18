import crypto from "node:crypto";
import type { RoundPlanItem } from "../generation/compose.js";
import type { KpCandidate, QuizQuestion, UserConfig } from "../types.js";

/**
 * Offline demo provider (`QUIZME_PROVIDER=local`).
 *
 * Serves canned knowledge points and cards so the full card flow — badges,
 * takeaway, "not sure" skip, SRS scheduling, round summary — can be
 * experienced without a working `claude` CLI. Content is static; the real
 * variation-on-review behaviour needs the model path.
 */

export function isLocalProvider(): boolean {
  return process.env.QUIZME_PROVIDER === "local";
}

const DEMO_CANDIDATES: KpCandidate[] = [
  {
    name: "git-rebase-vs-merge",
    essence: "改写已共享的提交历史等于改写别人正在依赖的事实。",
    domain: ["git"],
    suggestedDepth: 3,
    relevance: 0.95,
    anchor: "演示：AI 用 rebase -i 整理了提交历史"
  },
  {
    name: "http-cache-revalidation",
    essence: "缓存新鲜度过期不等于内容失效，重验证可以避免整个响应重传。",
    domain: ["http", "networking"],
    suggestedDepth: 2,
    relevance: 0.85,
    anchor: "演示：AI 为静态资源配置了 Cache-Control"
  },
  {
    name: "react-usecallback-vs-usememo",
    essence: "useCallback 记忆函数本身，useMemo 记忆函数的计算结果。",
    domain: ["react"],
    suggestedDepth: 2,
    relevance: 0.8,
    anchor: "演示：AI 在组件里用 useCallback 包了事件处理函数"
  },
  {
    name: "node-event-loop-microtasks",
    essence: "微任务在当前宏任务结束后立即清空，饿死渲染/IO 的通常是它。",
    domain: ["node", "javascript"],
    suggestedDepth: 3,
    relevance: 0.75,
    anchor: "演示：AI 解释了 Promise.then 与 setTimeout 的执行顺序"
  },
  {
    name: "sql-index-selectivity",
    essence: "索引是否被用取决于选择性——低区分度的列建索引常常是白建。",
    domain: ["database", "sql"],
    suggestedDepth: 2,
    relevance: 0.7,
    anchor: "演示：AI 给查询慢的表加了复合索引"
  }
];

export function demoExtractKnowledgePoints(): KpCandidate[] {
  return DEMO_CANDIDATES;
}

type DemoCardContent = Omit<QuizQuestion, "id" | "kpId" | "origin" | "depth">;

const DEMO_CARDS: Record<string, DemoCardContent> = {
  "git-rebase-vs-merge": {
    sourceMode: "contextual",
    topic: "Git 历史管理",
    difficulty: 3,
    question: "AI 刚才用 git rebase -i 整理了你项目的提交历史。如果这条分支已经推送并被同事拉取，这个操作就变得危险了——为什么？",
    choices: [
      { id: "A", text: "rebase 会自动删除远程分支的保护规则" },
      { id: "B", text: "rebase 生成新的提交对象、改写了他人正在依赖的历史，迫使协作者手工修复" },
      { id: "C", text: "rebase 会把所有提交压缩成一个，丢失全部提交信息" },
      { id: "D", text: "rebase 只能在主分支上执行，在其他分支会直接报错" }
    ],
    answer: "B",
    explanation:
      "Git 的提交是不可变对象，rebase 并不是\"移动\"提交，而是逐个重放并生成一批全新的提交对象，旧提交随之被抛弃。只要这段历史还只在你本地，怎么改写都是安全的；可一旦推送并被他人拉取，别人的分支就建立在旧提交之上——你改写历史后，双方的历史产生分叉，协作者会在拉取时遇到诡异的冲突，只能用 rebase --onto 或 cherry-pick 手工修复。所以工程实践中的判断标准只有一条：提交是否已被共享。私有分支上大胆用 rebase 保持历史整洁，共享分支上一律用 merge 或 revert 这类\"只追加、不改写\"的操作。",
    whyWrong: {
      A: "分支保护规则是托管平台（如 GitHub）的配置，与 rebase 操作无关。",
      C: "压缩提交是 squash 的行为，rebase 默认逐个重放提交、保留各自信息。",
      D: "rebase 可以在任何分支上执行，没有这种限制。"
    },
    tags: ["git", "collaboration"],
    followUps: ["rebase 之后如何安全地推送？", "revert 和 reset 有什么区别？"],
    takeaway: "改写已共享的提交历史 = 改写别人正在依赖的事实。"
  },
  "http-cache-revalidation": {
    sourceMode: "contextual",
    topic: "HTTP 缓存",
    difficulty: 2,
    question: "AI 刚才为你的静态资源配置了缓存策略。当浏览器里的缓存过期后，它并不直接重新下载资源，而是先发一个条件请求做重验证——为什么要多这一步？好处是什么？",
    choices: [
      { id: "A", text: "条件请求可以绕过 CDN 直接回源，拿到最新内容" },
      { id: "B", text: "内容很可能没变——304 响应不带响应体，一次轻量往返就能给缓存续期，省掉整个内容的重传" },
      { id: "C", text: "条件请求能跳过 TLS 握手，因此更快也更安全" },
      { id: "D", text: "HTTP 规范强制要求所有请求都必须先经过条件请求" }
    ],
    answer: "B",
    explanation:
      "HTTP 缓存把\"新鲜度\"和\"正确性\"分成了两件事：max-age 到期只说明缓存不再新鲜，并不代表源站内容真的变了。所以浏览器带着 ETag（If-None-Match）或 Last-Modified（If-Modified-Since）去问服务器\"我手里这份还能用吗\"。内容没变时服务器只回一个不带响应体的 304，浏览器给本地副本续期继续用——大文件的传输成本被压缩成了一次几百字节的往返。这就是为什么静态资源的最佳实践是\"长缓存 + 内容指纹\"，而 HTML 这类入口文件用 no-cache（每次重验证）：既保证更新能及时到达，又把带宽开销降到最低。",
    whyWrong: {
      A: "条件请求同样经过 CDN，CDN 本身就能应答 304，不存在绕过。",
      C: "条件请求走的连接与普通请求相同，TLS 握手照常进行。",
      D: "规范没有这种强制，是否重验证由缓存策略（Cache-Control）决定。"
    },
    tags: ["http", "caching"],
    followUps: ["ETag 和 Last-Modified 哪个优先？", "Cache-Control: no-cache 和 no-store 的区别？"],
    takeaway: "过期不等于失效——重验证让缓存以一次轻量往返换掉整个响应体的重传。"
  },
  "react-usecallback-vs-usememo": {
    sourceMode: "contextual",
    topic: "React Hooks",
    difficulty: 2,
    question: "AI 刚才在你的组件里，把传给子组件的事件处理函数用 useCallback 包了起来。为什么这样做能避免子组件的无谓重渲染？它起作用的前提是什么？",
    choices: [
      { id: "A", text: "useCallback 会阻止父组件本身重渲染，子组件自然也不再渲染" },
      { id: "B", text: "useCallback 在依赖不变时返回同一个函数引用，配合子组件的 React.memo 浅比较才能跳过渲染——两者缺一不可" },
      { id: "C", text: "useCallback 缓存了函数的计算结果，子组件拿到的是缓存值所以不用重新渲染" },
      { id: "D", text: "useCallback 把函数编译成了静态代码，React 因此跳过对它的 diff" }
    ],
    answer: "B",
    explanation:
      "React 组件每次渲染都会重新执行函数体，这意味着组件里定义的每个函数在每次渲染时都是一个全新的引用。如果把这样的函数作为 prop 传给子组件，即使逻辑完全没变，子组件收到的 prop 在引用比较上也\"变了\"。useCallback 的作用就是在依赖数组不变时，返回上一次的那个函数引用，让 prop 保持稳定。但关键在于：引用稳定本身不产生任何优化——必须配合 React.memo 包裹子组件，让它用浅比较跳过渲染，useCallback 才有意义。实践中先确认子组件渲染确实昂贵、且已被 memo 包裹，再上 useCallback，否则只是白付一份缓存开销。",
    whyWrong: {
      A: "useCallback 不影响父组件是否重渲染，它只稳定函数的引用。",
      C: "缓存计算结果的是 useMemo——useCallback 缓存的是函数本身的引用，函数并没有被执行。",
      D: "不存在编译成静态代码的机制，React 的跳过渲染靠的是 memo 的 props 比较。"
    },
    tags: ["react", "hooks", "performance"],
    followUps: ["React.memo 的浅比较是怎么工作的？", "什么时候不值得用 useCallback？"],
    takeaway: "useCallback 稳定的是函数引用，它必须和 React.memo 配对才产生优化。"
  },
  "node-event-loop-microtasks": {
    sourceMode: "contextual",
    topic: "事件循环",
    difficulty: 3,
    question: "AI 刚才在调试你代码里的异步时序问题：同一段代码里既有 Promise.then 又有 setTimeout(fn, 0)。为什么 Promise.then 的回调总是先执行？这背后的机制是什么？",
    choices: [
      { id: "A", text: "Promise 对象带有更高的优先级字段，运行时按优先级排序回调" },
      { id: "B", text: "微任务队列在当前执行栈清空后、进入下一个宏任务前被完整清空，这个顺序由规范保证" },
      { id: "C", text: "setTimeout 有至少 4ms 的最小延迟，所以它总是更慢" },
      { id: "D", text: "这是各运行时的实现巧合，顺序并无规范保证" }
    ],
    answer: "B",
    explanation:
      "JavaScript 的事件循环把待执行的回调分成两类队列：宏任务（setTimeout、IO、UI 事件）和微任务（Promise 回调、queueMicrotask）。规范规定：每执行完一个宏任务、当前调用栈清空后，必须先把微任务队列完整清空，才能取下一个宏任务。所以 Promise.then 永远插队在 setTimeout 之前，这不是实现巧合，而是所有合规运行时的一致行为。这个模型解释了两类常见问题：为什么 await 后面的代码比 setTimeout 先跑（await 本质是微任务），以及为什么在微任务里不断补充新微任务会\"饿死\"渲染和 IO——队列清不空，宏任务永远轮不上。排查异步时序 bug 时，先把回调按宏/微分类，顺序自然就清楚了。",
    whyWrong: {
      A: "不存在优先级字段，顺序由队列类型决定，而不是对象属性。",
      C: "4ms 最小延迟只在嵌套定时器达到一定深度时生效，且即便延迟为 0，宏任务也要排在微任务之后。",
      D: "该顺序由 HTML/ECMAScript 规范明确定义，所有合规运行时行为一致。"
    },
    tags: ["javascript", "event-loop", "node"],
    followUps: ["queueMicrotask 和 process.nextTick 的区别？", "微任务饿死宏任务会发生什么？"],
    takeaway: "微任务在当前宏任务结束后立即清空——理解这一点是排查异步时序问题的钥匙。"
  },
  "sql-index-selectivity": {
    sourceMode: "contextual",
    topic: "数据库索引",
    difficulty: 2,
    question: "AI 刚才在优化你的慢查询时给表加了索引，但特意没给\"性别\"这类列建。为什么给低区分度的列（如性别，只有男/女两个值）单独建索引，查询优化器往往根本不用它？",
    choices: [
      { id: "A", text: "B+ 树不支持重复值过多的列，索引会构建失败" },
      { id: "B", text: "每个值约命中一半数据，索引扫描加大量随机回表的总代价反而高于顺序全表扫描" },
      { id: "C", text: "查询优化器默认忽略所有二级索引，只信任主键" },
      { id: "D", text: "低区分度列的索引会引发锁表，优化器为了避免锁而放弃它" }
    ],
    answer: "B",
    explanation:
      "索引的价值取决于\"选择性\"：一个条件能把候选行筛掉多少。二级索引的查询路径是先扫索引、再按主键逐行回表，回表是随机 IO，比顺序扫描昂贵得多。性别列每个值命中约 50% 的行，走索引意味着几百万次随机回表，优化器基于统计信息估算后会发现：还不如从头到尾顺序扫一遍全表。所以它\"用不用索引\"不是规则问题，而是成本估算的结果。实践启示：建索引前先看列的区分度（不同值数量 / 总行数），低选择性的列要么不建，要么放进复合索引的非首列，或者干脆依赖覆盖索引消除回表。",
    whyWrong: {
      A: "B+ 树对重复值没有限制，索引可以正常构建，只是不划算。",
      C: "优化器完全会使用二级索引，前提是成本估算显示它更便宜。",
      D: "是否用索引与锁表无关，这是纯粹的执行代价权衡。"
    },
    tags: ["database", "sql", "indexing"],
    followUps: ["复合索引的最左前缀原则是什么？", "什么是覆盖索引？"],
    takeaway: "索引值不值得建看选择性——低区分度的列建索引常常是白建。"
  }
};

/** Fallback card for KPs not in the canned bank (e.g. review of an older KP). */
function fallbackCard(item: RoundPlanItem): DemoCardContent {
  const { kp } = item;
  return {
    sourceMode: "contextual",
    topic: kp.name,
    difficulty: item.depth,
    question: `【演示卡片】复习「${kp.name}」这个知识点：下面哪个说法是它的正确结论？`,
    choices: [
      { id: "A", text: kp.essence },
      { id: "B", text: "该概念只在特定框架版本中成立" },
      { id: "C", text: "该概念已被现代工具链淘汰" },
      { id: "D", text: "该概念仅影响代码风格，与行为无关" }
    ],
    answer: "A",
    explanation: `这是演示模式下的占位卡片，仅用于体验复习流程。真实模式中，模型会围绕「${kp.name}」结合你当前的项目情境，换一个角度重新出一道变式题，并给出完整的段落解读。`,
    whyWrong: {
      B: "演示占位选项。",
      C: "演示占位选项。",
      D: "演示占位选项。"
    },
    tags: kp.domain.length ? kp.domain : ["demo"],
    followUps: [],
    takeaway: kp.essence
  };
}

export function demoGenerateCards({
  plan
}: {
  plan: RoundPlanItem[];
  config: UserConfig;
}): QuizQuestion[] {
  return plan.map((item, index) => {
    const content = DEMO_CARDS[item.kp.name] ?? fallbackCard(item);
    return {
      ...content,
      id: `q_${crypto.createHash("sha1").update(`${item.kp.id}:${index}:demo`).digest("hex").slice(0, 10)}`,
      kpId: item.kp.id,
      origin: item.origin,
      depth: item.depth
    };
  });
}

export function demoWhyAnswer(asked: string): string {
  return [
    `（演示模式）你问的是：「${asked}」。`,
    "离线模式下没有模型可用，这里只是占位回答。",
    "配置好 claude CLI（或 ANTHROPIC_API_KEY）后，why 模式会给出针对本题的深入讲解。"
  ].join("\n");
}

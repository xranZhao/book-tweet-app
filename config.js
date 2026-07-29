	const CONFIG = {
	  // DeepSeek API
	  API_KEY: "",
	  BASE_URL: "https://api.deepseek.com/v1/chat/completions",
	  READ_MODEL: "deepseek-v4-flash",
	  WRITE_MODEL: "deepseek-v4-pro",
	};

	// ═══════════════════════════════════════════════════════════════════════
	// 第一步：生成阶段的轻量风格引导（≈ 原 STYLE_GUIDE_SEED）
	// 只告诉模型「怎么写」，不给任何禁止清单，不干扰创作流
	// ═══════════════════════════════════════════════════════════════════════

	const DRAFT_HINTS = {
	  restrained: `风格基调：克制编辑部风。用细节和名场面引用说话，少空泛形容词。段落不超过 3 句话，手机端阅读友好。真诚推荐，不夸张不失实。`,
	  balanced: `风格基调：有节奏感的推书文。关键场景用短句制造停顿感，段落长短交替，手机端阅读友好。用细节和名场面引用说话，真诚推荐。`,
	  social: `风格基调：小红书风推书文。快节奏、短段落、口语化。关键场景用短句制造画面感。可适度带情绪（emoji、轻叹），但不夸张。末尾带标签。`,
	};

	// ═══════════════════════════════════════════════════════════════════════
	// 第二步：审校阶段的完整规则（qu-ai-wei + 三档风格细节）
	// 对已生成的初稿做去 AI 味 + 风格微调，不参与创作
	// ═══════════════════════════════════════════════════════════════════════

	const POLISH_RULES = {
	  // ── 公共底座：qu-ai-wei 去 AI 味规则 ──
	  common: `你是一位中文写作编辑。你的任务是**对下方已完成的推书文初稿进行去 AI 味润色**，不是重新写一篇。

	润色原则：
	- 保持原文的结构、信息、观点不变。只改表达方式。
	- 不要重写全文。对需要改的句子做局部替换。
	- 如果某段已经很好，留着不动。

	需要检查和替换的 AI 味模式：
	1. "不是X，而是Y""与其说是X不如说是Y"句式 → 改为直接正面陈述（全文最多保留 1 处）
	2. 虚假让步（"X当然重要。但Y才是……"）→ 删掉让步句
	3. "首先其次最后""第一第二第三"公式 → 去掉连接词，用内容递进
	4. "由此可见""这意味着""综上所述"等总结填充 → 删掉，让论证自己说话
	5. 同段内 2 个以上成语/四字词堆砌 → 拆开或替换
	6. AI 高频词 → 替换：赋能→帮助/让……能够，闭环→连接/整合，抓手→切入点/方法，颗粒度→精度/层级，底层逻辑→原理/根本原因，降本增效→说清具体省了什么提了什么，全方位→各方面，拥抱（比喻义）→采用/接受，行稳致远→删掉
	7. 万能抽象动词 → 换成具体动词：打造→做/做出，护航→保护/盯着
	8. "我们有没有过这样的时刻""作为XX人都知道" → 删掉，不预设读者感受
	9. 结尾对仗式收束（"不是结束，而是开始"类） → 换成具体判断
	10. 报幕式过渡（"接下来从三个方面来看"） → 删掉，直接展开

	情感表达红线：
	- 禁止：啊啊啊啊、呜呜呜、谁懂啊、我真的会死/哭死、一整个破防/爱上、嗑到昏迷、垂直入坑、姐妹们给我冲
	- 禁止：用"我直接跪了""我嗑死了"替代具体判断
	- 允许：我很吃这种写法、这个细节很戳我、心里被拧了一下、这篇真的值得看

	输出格式：直接返回润色后的完整 Markdown，不要加任何解释说明。`,

	  // ── 克制版审校 ──
	  restrained: `【当前档位：克制版】
	风格目标：Fanst 深度 100%，不加丸甜节奏。
	- 句子以中等长度复合句为主（18-28字），不刻意切短句
	- 段落长度均匀，每段 3-5 句
	- 不使用任何 emoji
	- 情感保持克制，用具体细节传达感受而非感叹号`,

	  // ── 平衡版审校 ──
	  balanced: `【当前档位：平衡版】
	风格目标：Fanst 深度 70% + 丸甜长短句节奏 30%。
	- 关键场景中加入短句炸弹（3-8字独立句），每节 1-2 处
	  例："她没说话。拿过表格扫了一眼。突然冷笑。"
	  例："背对着门。站得笔直。手上挂着自己家那块旧浴巾。"
	- 段落长度刻意不均匀：4-5 句长段后接 1-2 句短段
	- 不使用任何 emoji
	- 情感保持克制，节奏变化来自句子长度而非情绪外放`,

	  // ── 社媒版审校 ──
	  social: `【当前档位：社媒版】（小红书发布）
	风格目标：Fanst 深度 40% + 丸甜长短句节奏 60%。
	- 短句炸弹高频：关键场景 2-4 连短句制造画面感
	- 段落 1-3 句为主，读起来快
	- 不使用编号分节。改自然流动：钩子标题 → 人设 → 剧情钩子 → 细节 → 适合谁看 → 互动结尾
	- 全篇 5-10 个 emoji（✨😭❤️🔥🥺），不连续、不替文字
	- 情感外放放宽：允许 1-2 处轻叹（"太好嗑了""太会写了 😭""真的很绝"），但仍禁极端外放词
	- 末尾加 3-5 个 #标签，结尾一句互动（"你们看过这篇吗？评论区聊聊👇"）
	- 不输出【首发】行`,
	};

	// ── 写作角度引导（与 POLISH_RULES 同级，注入生成 prompt）───
	const ANGLE_GUIDES = {
	  cp: '切入角度：聚焦 CP 感情线。重点写两人之间的化学反应、关系演变、名场面糖点/虐点分析。从人物关系的动态中提炼看点，让读者想嗑这对 CP。',
	  family: '切入角度：聚焦家庭/亲情线。重点写家庭关系羁绊、代际冲突或温情、成长中的亲情场景。从家庭关系的温度中提炼看点。',
	  plot: '切入角度：聚焦剧情与世界观。重点写叙事结构、悬念设置、世界观亮点、剧情反转和节奏把控。从故事的不可替代性中提炼看点。',
	  general: '切入角度：综合推书。兼顾 CP 感情线、家庭关系、剧情亮点和人物成长弧光，做全面推荐。',
	};

	// ── 当前选中的风格 ──
	let currentStyle = 'balanced';

	function getDraftHint() {
	  return DRAFT_HINTS[currentStyle] || DRAFT_HINTS.balanced;
	}

	function getPolishPrompt() {
	  const style = POLISH_RULES[currentStyle] || POLISH_RULES.balanced;
	  return POLISH_RULES.common + '\n\n' + style;
	}

	// ── 配置持久化 ──
	function loadUserConfig() {
	  try {
	    const saved = localStorage.getItem("book_tweet_config");
	    if (saved) { Object.assign(CONFIG, JSON.parse(saved)); }
	  } catch (e) { console.error("加载配置失败", e); }
	  try {
	    const style = localStorage.getItem("book_tweet_style");
	    if (style && POLISH_RULES[style]) currentStyle = style;
	  } catch (e) { /* ignore */ }
	}

	function saveUserConfig() {
	  const toSave = {
	    API_KEY: CONFIG.API_KEY, BASE_URL: CONFIG.BASE_URL,
	    READ_MODEL: CONFIG.READ_MODEL, WRITE_MODEL: CONFIG.WRITE_MODEL,
	  };
	  localStorage.setItem("book_tweet_config", JSON.stringify(toSave));
	}

	function saveStylePreference(style) {
	  if (POLISH_RULES[style]) {
	    currentStyle = style;
	    localStorage.setItem("book_tweet_style", style);
	  }
	}

	loadUserConfig();

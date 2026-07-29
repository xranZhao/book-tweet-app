	const CONFIG = {
	  // DeepSeek API
	  API_KEY: "",
	  BASE_URL: "https://api.deepseek.com/v1/chat/completions",
	  READ_MODEL: "deepseek-v4-flash",
	  WRITE_MODEL: "deepseek-v4-pro",
	};

	// ═══════════════════════════════════════════════════════════════════════
	// 三档风格——由 prompts/推文风格指南.md 凝练而成
	// 融合 qu-ai-wei 去 AI 味规则 + Fanst 深度书评 + 丸甜长短句节奏
	// ═══════════════════════════════════════════════════════════════════════

	const APP_STYLES = {
	  // ── 风格公共底座（三档共用） ──
	  common: `风格定位：认真书评人口吻，用细节和具体感受替代万能形容词。真诚推荐，不夸张不失实。

	qu-ai-wei 去 AI 味硬约束（严格遵守）：
	- 禁止"不是X而是Y""与其说是X不如说是Y"句式（全文最多1次）
	- 禁止虚假让步三拍（"X当然重要。但Y才是……"）
	- 禁止"首先其次最后""第一第二第三"公式化递进
	- 禁止"由此可见""这意味着""综上所述"等总结填充
	- 禁止"我们有没有过这样的时刻""作为XX人都知道"等虚假共鸣
	- 禁止同段内2个以上成语/四字词堆砌
	- 禁止以下 AI 高频词：赋能、闭环、抓手、颗粒度、底层逻辑、降本增效、全方位、拥抱（比喻义）、行稳致远
	- 不用万能抽象动词：打造→做/做出，护航→保护/盯着，激发→（换成具体的动作）
	- 结尾不用对仗式收束（"不是结束，而是开始"类）
	- 不出现报幕式过渡（"接下来从三个方面来看"类）

	情感表达红线（三档通用）：
	- 禁止：啊啊啊啊、呜呜呜、谁懂啊、我真的会死/哭死、一整个破防/爱上、嗑到昏迷、垂直入坑、姐妹们给我冲
	- 禁止：用"我直接跪了""我嗑死了"替代具体判断
	- 允许：我很吃这种写法、这个细节很戳我、心里被拧了一下、这篇真的值得看
	- 允许：提前说清楚/说实话/恕我直言（Fanst 式判断引入）

	结构要求：
	- 严格使用 ### 00 / ### 01 / ### 02 / ### 03 / ### 04 / ### 05 六节编号
	- 每节 1-3 段短段落，每段不超过 3 句话，手机端阅读友好
	- 关键引用用 > blockquote，围绕 quote 展开自己的感受
	- 全文控制在 1500 字左右`,

	  // ── 克制版 ──
	  restrained: `【风格档位：克制版】
	Fanst 深度 100%，不加丸甜节奏。
	- 句子以中等长度复合句为主（18-28字），不刻意切短句
	- 段落长度均匀，每段 3-5 句
	- 不使用任何 emoji
	- 情感保持克制，用具体细节传达感受而非感叹号
	- 判断句作为每段锚点（"这个转变是可追溯的""力不在台词，在那个细节上"）`,

	  // ── 平衡版 ──
	  balanced: `【风格档位：平衡版】
	Fanst 深度 70% + 丸甜长短句节奏 30%。
	- 关键场景中加入短句炸弹（3-8字独立句，制造停顿感），每节 1-2 处
	  例："她没说话。拿过表格扫了一眼。突然冷笑。"
	  例："背对着门。站得笔直。手上挂着自己家那块旧浴巾。"
	- 段落长度刻意不均匀：4-5 句长段 → 1-2 句短段 → 3-4 句长段
	- 长句（20+字）叙述后，跟一句短句换气
	- 不使用任何 emoji
	- 情感保持克制（同克制版），节奏变化来自句子长度而非情绪外放`,

	  // ── 社媒版（小红书） ──
	  social: `【风格档位：社媒版】（小红书发布）
	Fanst 深度 40% + 丸甜长短句节奏 60%。
	- 短句炸弹高频使用，关键场景中 2-4 连短句制造画面感
	- 大部分段落 1-3 句，偶尔 5 句长段，阅读节奏快
	- 不使用编号分节结构。改用自然流动：钩子标题 → 人设 → 推荐度 → 剧情钩子 → 最戳细节 → 适合谁看 → 互动结尾
	- 全篇 5-10 个 emoji（✨😭❤️🔥🥺），不连续使用，不替代文字
	- 情感外放适度放宽：每篇 1-2 处轻叹（"太好嗑了""太会写了 😭""真的很绝"），但仍禁止极端外放词
	- 文本约 800-1000 字，末尾 3-5 个 #标签
	- 结尾一句话互动（"你们看过这篇吗？评论区聊聊👇"）
	- 注意：不输出【首发】平台信息行`,
	};

	// 当前选中的风格（默认平衡版）
	let currentStyle = 'balanced';

	function getStylePrompt() {
	  const style = APP_STYLES[currentStyle] || APP_STYLES.balanced;
	  return APP_STYLES.common + '\n\n' + style;
	}

	function loadUserConfig() {
	  try {
	    const saved = localStorage.getItem("book_tweet_config");
	    if (saved) {
	      const user = JSON.parse(saved);
	      Object.assign(CONFIG, user);
	    }
	  } catch (e) {
	    console.error("加载配置失败", e);
	  }
	  // 加载风格偏好
	  try {
	    const style = localStorage.getItem("book_tweet_style");
	    if (style && APP_STYLES[style]) currentStyle = style;
	  } catch (e) { /* ignore */ }
	}

	function saveUserConfig() {
	  const toSave = {
	    API_KEY: CONFIG.API_KEY,
	    READ_MODEL: CONFIG.READ_MODEL,
	    WRITE_MODEL: CONFIG.WRITE_MODEL,
	    BASE_URL: CONFIG.BASE_URL,
	  };
	  localStorage.setItem("book_tweet_config", JSON.stringify(toSave));
	}

	function saveStylePreference(style) {
	  if (APP_STYLES[style]) {
	    currentStyle = style;
	    localStorage.setItem("book_tweet_style", style);
	  }
	}

	loadUserConfig();

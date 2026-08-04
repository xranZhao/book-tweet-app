		const CONFIG = {
		  // DeepSeek API
		  API_KEY: "",
		  BASE_URL: "https://api.deepseek.com/v1/chat/completions",
		  READ_MODEL: "deepseek-v4-flash",
		  WRITE_MODEL: "deepseek-v4-pro",
		};

		// ── 写作角度引导（注入生成 prompt）───
		const ANGLE_GUIDES = {
		  cp: '切入角度：聚焦 CP 感情线。重点写两人之间的化学反应、关系演变、名场面糖点/虐点分析。从人物关系的动态中提炼看点，让读者想嗑这对 CP。',
		  family: '切入角度：聚焦家庭/亲情线。重点写家庭关系羁绊、代际冲突或温情、成长中的亲情场景。从家庭关系的温度中提炼看点。',
		  plot: '切入角度：聚焦剧情与世界观。重点写叙事结构、悬念设置、世界观亮点、剧情反转和节奏把控。从故事的不可替代性中提炼看点。',
		  general: '切入角度：综合推书。兼顾 CP 感情线、家庭关系、剧情亮点和人物成长弧光，做全面推荐。',
		};

		// ── 配置持久化 ──
		function loadUserConfig() {
		  try {
		    const saved = localStorage.getItem("book_tweet_config");
		    if (saved) { Object.assign(CONFIG, JSON.parse(saved)); }
		  } catch (e) { console.error("加载配置失败", e); }
		}

		function saveUserConfig() {
		  const toSave = {
		    API_KEY: CONFIG.API_KEY, BASE_URL: CONFIG.BASE_URL,
		    READ_MODEL: CONFIG.READ_MODEL, WRITE_MODEL: CONFIG.WRITE_MODEL,
		  };
		  localStorage.setItem("book_tweet_config", JSON.stringify(toSave));
		}

		loadUserConfig();

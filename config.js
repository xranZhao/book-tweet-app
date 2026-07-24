const CONFIG = {
  // DeepSeek API
  API_KEY: "",
  BASE_URL: "https://api.deepseek.com/v1/chat/completions",
  READ_MODEL: "deepseek-v4-flash",
  WRITE_MODEL: "deepseek-v4-pro",
};

// 风格指南种子（复用 fanst-app 初始风格）
const STYLE_GUIDE_SEED = `风格基调：克制编辑部风。标题用悬念式，正文口语真诚。多用细节和名场面引用，少空泛形容词。强调作者和原作荣誉。
段落要求：每段不超过 3 句话，手机端阅读友好。关键引用用粉色左边框 blockquote 突出。
名场面描写：用对话片段和具体场景，不要用"很好看""很感动"这类空泛词。
结尾：真诚邀请读者留言互动，语气自然不油腻。`;

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

loadUserConfig();

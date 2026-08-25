/* ============================================================
 * 站点配置 —— 唯一需要你手动维护的文件
 * ============================================================ */
const SITE_CONFIG = {
  // 情侣昵称
  him: "LYK",
  her: "DMY",

  // 正式在一起的日期（用于恋爱计时器），格式：YYYY-MM-DD
  anniversaryDate: "2025-08-26",

  // GitHub 仓库信息（管理端上传照片用，Token 不会写在这里，只在浏览器本地保存）
  // 本站作为主站的子页面部署在 featherblade91.github.io/foreverU3
  repo: {
    owner: "featherblade91",
    name: "featherblade91.github.io",
    branch: "master",
    pathPrefix: "foreverU3", // 仓库内子目录；若用独立仓库部署则改为 ""
  },

  // 首页副标题
  subtitle: "把每一个平凡的日常，都过成值得收藏的浪漫",

  // 悄悄话（首页左下角有个淡淡的小信封 💌，点它弹出——故意藏起来的）
  loveLetter: {
    title: "To 我最爱的 DMY",
    // 每段一行，打字机效果逐行显示
    lines: [
      "见字如面。",
      "世界很大，人潮很挤，",
      "但我最幸运的事，就是在茫茫人海里抓住了你的手。",
      "往后的日子，春花、夏雨、秋叶、冬雪，",
      "我都想和你一起看。",
      "—— 永远爱你的 LYK",
    ],
  },

  // 重要纪念日（月-日），会在首页倒计时提醒、时间轴上高亮
  milestones: [
    { date: "08-26", title: "在一起纪念日" },
    { date: "01-19", title: "她的生日" },
    { date: "05-27", title: "他的生日" },
    { date: "05-20", title: "520 告白日" },
  ],

  // 背景音乐：五首歌连续循环，曲目表在 js/music.js
  music: {
    enabled: true,
    volume: 0.5, // 0 ~ 1
  },
};

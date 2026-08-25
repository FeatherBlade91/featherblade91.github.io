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
  subtitle: "你湛蓝如天空",

  // 悄悄话（首页左下角有个淡淡的小信封 💌，点它弹出——故意藏起来的）
  loveLetter: {
    title: "To 我最爱的 DU3",
    // 每段一行，打字机效果逐行显示
    lines: [
      "你是火焰",
      "在荒芜的原野上点燃我，让我内心无比滚烫",
      "你是奇迹",
      "把我推向命运，又在命运的手中一次次解救我",
      "谢谢你教我如何去爱",
      "——你忠诚的 LA4"
    ],
  },

  // 重要纪念日（月-日），会在首页倒计时提醒、时间轴上高亮
  milestones: [
    { date: "08-26", title: "在一起纪念日" },
    { date: "01-19", title: "她的生日" },
    { date: "05-27", title: "他的生日" },
  ],

  // 背景音乐：五首歌连续循环，曲目表在 js/music.js
  music: {
    enabled: true,
    volume: 0.5, // 0 ~ 1
  },
};

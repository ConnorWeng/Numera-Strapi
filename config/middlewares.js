module.exports = [
  "strapi::logger",
  "strapi::errors",
  "strapi::security",
  "strapi::cors",
  "strapi::poweredBy",
  "strapi::query",
  "strapi::body",
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
  {
    name: "global::rate-limit",
    config: {
      windowMs: 60 * 1000, // 1分钟窗口
      defaultLimit: 1000, // 默认认证用户限制
      anonymousLimit: 1000, // 匿名用户限制
      production: false, // 是否使用 Redis
    },
  },
];

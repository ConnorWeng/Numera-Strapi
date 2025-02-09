const rateLimit = require("koa-ratelimit");
// const { createClient } = require('redis');

// 生产环境使用 Redis
// const redisClient = createClient({ url: 'redis://localhost:6379' });
// redisClient.connect().catch(console.error);

/* const store = config.production 
      ? {
          async get(key) { return redisClient.get(key) },
          async set(key, value) { await redisClient.set(key, value, 'PX', config.windowMs) }
        }
      : new Map(); */
const store = new Map();

module.exports = (config, { strapi }) => {
  return async (ctx, next) => {
    const user = ctx.state.user;
    let maxLimit;
    if (!user) {
      maxLimit = config.anonymousLimit || 1000; // 匿名用户限制
    } else {
      maxLimit = user.rateLimit || config.defaultLimit || 1000;
    }
    return rateLimit({
      driver: "memory", // 或 'redis'
      db: store,
      duration: config.windowMs || 60 * 1000,
      max: maxLimit,
      id: (ctx) =>
        ctx.state.user ? `user_${ctx.state.user.id}` : `ip_${ctx.ip}`,
      headers: {
        remaining: "X-RateLimit-Remaining",
        reset: "X-RateLimit-Reset",
        total: "X-RateLimit-Limit",
      },
      throw: true,
    })(ctx, next);
  };
};

module.exports = () => {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      if (err.status === 429) {
        console.log(ctx.request.body);
        ctx.status = 200;
        ctx.body = {
          error: "Too Many Requests",
          message: `受到并发数控制，你的账号每分钟可请求${ctx.state.user.rateLimit}次，请稍后再试`,
        };
      } else {
        ctx.throw(err);
      }
    }
  };
};

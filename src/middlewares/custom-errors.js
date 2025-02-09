const { isPythonClient, transformErrorTask } = require("../util/common");
const { RATE_LIMITED } = require("../util/error-codes");
const TranslateTask = require("../util/task");

module.exports = () => {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      if (err.status === 429) {
        // @ts-ignore
        const { signature, ...body } = ctx.request.body;
        const { data } = body;
        // @ts-ignore
        const { IMSI } = data;

        ctx.status = 200;
        const task = new TranslateTask();
        const isPythonClientFlag = isPythonClient(ctx);
        task.setIMSI(IMSI);
        ctx.body = transformErrorTask(isPythonClientFlag, task, RATE_LIMITED);
      } else {
        ctx.throw(err);
      }
    }
  };
};

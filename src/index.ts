import { Context, Schema } from 'koishi'
import type { OneBotBot } from 'koishi-plugin-adapter-onebot'

import { FixedSizeArray } from './FixedSizeArray';

export const name = 'dst-forward'
export const inject = {
  required: ['server']
}
export const usage = `
轻松实现饥荒服务器与qq互通聊天
需要在饥荒服务端中安装mod:DST TO QQ
需要onebot适配器
[部署详细教程](101.132.253.14/archives/143)
`
export interface Config {
  botId: string
  groupId: string
  tag: string
}

export const Config: Schema<Config> = Schema.object({
  botId: Schema.string().required().description('机器人的QQ号'),
  groupId: Schema.string().required().description('群号'),
  tag: Schema.string().description('以此符号开头的消息会被传到服务器中,为空的话每条消息都会进去').default('#'),
})

// 声明一个固定数组,缓存最近的指令消息
const messageArray = new FixedSizeArray(3);


export function apply(ctx: Context, conf: Config) {
  const bot = ctx.bots[`onebot:${conf.botId}`] as OneBotBot<Context>;

  ctx.command('dst <msg:string>', 'dst-forward房间操作').alias('饥荒')
    .option('roll', '-r  回档 (天数)')
    .option('reset', '-e 重置世界')
    .option('save', '-s 保存')
    .action((argv, msg) => sendComm(argv, ctx, msg))

  //中间件
  ctx.middleware((session) => {
    //获取发送者群名片,如无群名片则用昵称
    let userInfo = session.onebot.sender.card ? session.onebot.sender.card : session.onebot.sender.nickname
    //判断是否以占位符开头
    if (!conf.tag) {
      ctx.logger.info(userInfo + "addArray:" + session.content);
      messageArray.add(userInfo, session.content);
      return;
    }
    else if (session.content && session.content.charAt(0) === conf.tag) {
      ctx.logger.info(userInfo + "addArray:" + session.content);
      messageArray.add(userInfo, session.content.slice(1));
      return;
    }
  });

  const app = ctx.server._koa;
  const router = ctx.server;
  // 发送消息的 POST 路由
  router.post('/send_msg', async (routerCtx) => {
    const { message } = routerCtx.request.body;

    if (!message) {
      routerCtx.status = 400;
      routerCtx.body = { error: 'Invalid JSON' };
      return;
    }
    ctx.logger.info(`收到了dst消息: ${message}`);
    bot.internal.sendGroupMsg(conf.groupId, message.toString());
    ctx.logger.info(`向群发送了消息: ${message}`);
    routerCtx.status = 200;
    routerCtx.body = { success: true };
  });
  // 获取消息的 GET 路由
  router.get('/get_msg', async (routerCtx) => {
    const messages = messageArray.getItems();
    messageArray.clear(); // 清空消息数组
    routerCtx.status = 200;
    routerCtx.body = { success: true, messages };
  });
  // 中间件和路由
  //app.use(bodyParser());  // 解析 JSON 请求体
  app.use(router.routes());
  app.use(router.allowedMethods());
}

async function sendComm(argv: any, ctx: Context, msg: string) {
  //群号
  //const groupId = argv.session.onebot.group_id;
  //发送者id
  //const userId = argv.session.onebot.user_id.toString();
  //发送者身份 owner 或 admin 或 member,如果在白名单则无视权限
  var userRole = argv.session.onebot.sender.role

  if (userRole == "member") {
    return '非管理无法操作喵';
  }
  if (argv.options.roll) {
    ctx.logger.info(`收到 roll...`);
    if (!msg) {
      await argv.session.send('请输入回档天数:')
      msg = await argv.session.prompt(20000)
      if (!msg) return '输入超时, 已取消回档'
    }
    await argv.session.send('确定要回档' + msg + '天吗？ (输入Y确认)')
    const confirm = await argv.session.prompt(20000)
    if (!confirm || confirm.toLowerCase() != 'y') return '已取消回档'
    messageArray.add('rollback', msg, true)
    return `正在回档${msg}天...`
  } else if (argv.options.reset) {
    ctx.logger.info(`收到 reset...`);
    await argv.session.send('警告,确定要重置整个世界吗？ (输入Y确认)')
    const confirm = await argv.session.prompt(20000)
    if (!confirm || confirm.toLowerCase() != 'y') return '已取消重置'
    messageArray.add('reset', '', true)
    return `正在重置世界...`
  } else if (argv.options.save) {
    ctx.logger.info(`收到 save...`);
    await argv.session.send('确定要保存吗？ (输入Y确认)')
    const confirm = await argv.session.prompt(20000)
    if (!confirm || confirm.toLowerCase() != 'y') return '已取消保存'
    messageArray.add('save', '', true)
    return `正在保存...`
  }
  return '未指定操作 输入dst --help查看命令详细'
}
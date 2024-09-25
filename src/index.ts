import { Context, Schema } from 'koishi'
import type { OneBotBot } from 'koishi-plugin-adapter-onebot'

import { FixedSizeArray } from './FixedSizeArray';

export const name = 'dst-forward'
export const inject = {
  required: ['server']
}
export const usage = `
轻松实现饥荒服务器与qq互通聊天<br/>
需要在饥荒服务端中安装mod:DST TO QQ<br/>
如果开启了分群配置,当serverNumber与dst服务器中设置相同时才会发送,可设置群聊与服务器一对一,一对多,多对一,多对多<br/>
每次修改配置后最好是重启koishi一次<br/>
需要onebot适配器<br/>
[部署详细教程](101.132.253.14/archives/143)
`
export interface Config {
  botId: string
  groupId: string
  tag: string
  groupSeparate: boolean
  groupArray: Array<{
    groupId: string,
    serverNumber: number
  }>
}


export const Config = Schema.intersect([
  Schema.object({
    botId: Schema.string().required().description('机器人的QQ号'),
    groupId: Schema.string().required().description('群号'),
    tag: Schema.string().description('以此符号开头的消息会被传到服务器中,为空的话每条消息都会进去').default('#'),
  }).description('基础配置'),
  Schema.object({
    groupSeparate: Schema.boolean().default(false).description('开启分群配置(开启后上面的群号设置无效)'),
  }).description('分群配置'),
  Schema.union([
    Schema.object({
      groupSeparate: Schema.const(true).required(),
      groupArray: Schema.array(Schema.object({
        groupId: Schema.string().description("群号").required(),
        serverNumber: Schema.number().description("服务号(需要和dstmod设置里对应)").required(),
      })).role('table')
    }),
    Schema.object({}),
  ])
])


// 声明一个固定数组,缓存最近的指令消息
const messageArray = new FixedSizeArray(6);


export function apply(ctx: Context, conf: Config) {

  const bot = ctx.bots[`onebot:${conf.botId}`] as OneBotBot<Context>;

  ctx.command('dst <msg:string>', 'dst-forward房间操作').alias('饥荒')
    .option('roll', '-r  回档 (天数)')
    .option('reset', '-e 重置世界')
    .option('save', '-s 保存')
    .option('ban', '-b 封禁 (科雷id)')
    .action((argv, msg) => sendComm(argv, ctx, conf, msg))

  //中间件,拦截群聊消息并放到消息栈
  ctx.middleware((session) => {
    //获取发送者群名片,如无群名片则用昵称
    let userInfo = session.onebot.sender.card ? session.onebot.sender.card : session.onebot.sender.nickname;
    let groupId = session.onebot.group_id;
    // 检查是否启用了发送前缀
    let content: string;
    if (session.content && !conf.tag) {
      content = session.content;
    } else if (session.content && session.content.charAt(0) === conf.tag) {
      content = session.content.slice(1);
    }

    //检查是否启用分群配置
    if (!conf.groupSeparate) {
      ctx.logger("dst-forward").info(userInfo + "addArray:" + session.content + " don't has serverNumber ");
      messageArray.add(userInfo, content, null)
    } else {
      conf.groupArray.forEach(element => {
        if (element.groupId === groupId.toString()) {
          ctx.logger("dst-forward").info(userInfo + "addArray:" + session.content + " serverNumber:" + element.serverNumber);
          messageArray.add(userInfo, content, element.serverNumber);
        }
      });
    }
  });

  const app = ctx.server._koa;
  const router = ctx.server;
  // 发送消息的 POST 路由
  router.post('/send_msg', async (routerCtx) => {
    const { message, serverId } = routerCtx.request.body;

    if (!message) {
      routerCtx.status = 400;
      routerCtx.body = { error: 'Invalid JSON' };
      return;
    }
    ctx.logger("dst-forward").info(`收到了来自:${serverId}的dst消息: ${message}`);
    if (!conf.groupSeparate) {
      bot.internal.sendGroupMsg(conf.groupId, message.toString());
      ctx.logger("dst-forward").info(`向群:${conf.groupId} 发送了消息:${message}`);
    } else {
      conf.groupArray.forEach(element => {
        if (element.serverNumber === serverId) {
          bot.internal.sendGroupMsg(element.groupId, message.toString());
          ctx.logger("dst-forward").info(`向群:${element.groupId} 发送了消息:${message}`);
        }
      });
    }
    routerCtx.status = 200;
    routerCtx.body = { success: true };
  });
  // 获取消息的 POST 路由
  router.post('/get_msg', async (routerCtx) => {
    //如果启用了分群配置,获取服务器号,否则直接赋null,给数组传serverNumber为null会使得每次获取删除消息都对整个数组操作
    const { serverId } = conf.groupSeparate ? routerCtx.request.body : null;
    const messages = messageArray.getItems(serverId);
    messageArray.clear(serverId); // 清空消息数组

    routerCtx.status = 200;
    routerCtx.body = { success: true, messages };
  });
  // 中间件和路由
  //app.use(bodyParser());  // 解析 JSON 请求体
  app.use(router.routes());
  app.use(router.allowedMethods());
}

async function sendComm(argv: any, ctx: Context, conf: Config, msg: string) {
  //群号
  //const groupId = argv.session.onebot.group_id;
  //发送者id
  //const userId = argv.session.onebot.user_id.toString();
  //发送者身份 owner 或 admin 或 member,如果在白名单则无视权限
  var userRole = argv.session.onebot.sender.role
  let groupId = argv.session.onebot.group_id;
  //本群可用的服务器号
  let serverIds = null;
  //指令指定的服务器号
  let serverId = null;
  conf.groupArray.forEach(element => {
    if (element.groupId === groupId.toString()) {
      serverIds = serverIds + element.serverNumber + ",";
    }
  });

  if (userRole == "member") {
    return '非管理无法操作喵';
  }
  if (argv.options.roll) {
    ctx.logger("dst-forward").info(`收到 roll...`);
    if (!msg) {
      await argv.session.send('请输入回档天数:')
      msg = await argv.session.prompt(20000)
      if (!msg) return '输入超时, 已取消回档'
    }
    if (conf.groupSeparate) {
      await argv.session.send(`请输入服务器号,当前可用服务器号:${serverIds}`)
      serverId = await argv.session.prompt(20000)
      if (!conf.groupArray.some(e => e.serverNumber === serverId)) return '服务器号不存在,已取消回档'
      if (!serverId) return '输入超时, 已取消回档'
    }
    if (!serverIds) {
      await argv.session.send('确定要回档' + msg + '天吗？ (输入Y确认)')
    } else {
      await argv.session.send('确定要给' + serverId + '回档' + msg + '天吗？ (输入Y确认)')
    }
    const confirm = await argv.session.prompt(20000)
    if (!confirm || confirm.toLowerCase() != 'y') return '已取消回档'
    messageArray.add('rollback', msg, serverId, true)
    return `正在回档${msg}天...`
  } else if (argv.options.reset) {
    ctx.logger("dst-forward").info(`收到 reset...`);
    if (conf.groupSeparate) {
      await argv.session.send(`请输入服务器号,当前可用服务器号:${serverIds}`)
      serverId = await argv.session.prompt(20000)
      if (!conf.groupArray.some(e => e.serverNumber === serverId)) return '服务器号不存在,已取消重置'
      if (!serverId) return '输入超时, 已取消重置'
    }
    if (!serverId) {
      await argv.session.send(`警告,确定要重置世界吗？ (输入Y确认)`)
    } else {
      await argv.session.send(`警告,确定要重置${serverId}世界吗？ (输入Y确认)`)
    }
    const confirm = await argv.session.prompt(20000)
    if (!confirm || confirm.toLowerCase() != 'y') return '已取消重置'
    messageArray.add('reset', '', serverId, true)
    return `正在重置世界...`
  } else if (argv.options.save) {
    ctx.logger("dst-forward").info(`收到 save...`);
    if (conf.groupSeparate) {
      await argv.session.send(`请输入服务器号,当前可用服务器号:${serverIds}`)
      serverId = await argv.session.prompt(20000)
      if (!conf.groupArray.some(e => e.serverNumber === serverId)) return '服务器号不存在,已取消保存'
      if (!serverId) return '输入超时, 已取消保存'
    }
    // await argv.session.send('确定要保存吗？ (输入Y确认)')
    // const confirm = await argv.session.prompt(20000)
    // if (!confirm || confirm.toLowerCase() != 'y') return '已取消保存'

    messageArray.add('save', '', serverId, true)
    return `正在保存...`
  }else if(argv.options.ban){
    ctx.logger("dst-forward").info(`收到 ban...`);
    if (!msg) {
      await argv.session.send('请输入封禁玩家的klei id:')
      msg = await argv.session.prompt(20000)
      if (!msg) return '输入超时, 已取消封禁'
    }
    if (conf.groupSeparate) {
      await argv.session.send(`请输入服务器号,当前可用服务器号:${serverIds}`)
      serverId = await argv.session.prompt(20000)
      if (!conf.groupArray.some(e => e.serverNumber === serverId)) return '服务器号不存在,已取消封禁'
      if (!serverId) return '输入超时, 已取消封禁'
    }
    if (!serverIds) {
      await argv.session.send('确定要封禁玩家' + msg + '吗？ (输入Y确认)')
    } else {
      await argv.session.send('确定要在' + serverId + '封禁玩家' + msg + '吗？ (输入Y确认)')
    }
    const confirm = await argv.session.prompt(20000)
    if (!confirm || confirm.toLowerCase() != 'y') return '已取消封禁'
    messageArray.add('ban', msg, serverId, true)
    return `已封禁玩家${msg}`
  }
  
  return '未指定操作 输入dst --help查看命令详细'
}
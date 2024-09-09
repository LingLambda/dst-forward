import { Context, Schema } from 'koishi'
import http from 'http'
import type { OneBotBot } from 'koishi-plugin-adapter-onebot'

import { FixedSizeArray } from './FixedSizeArray';

export const name = 'dst-forward'
export const usage = `
轻松实现饥荒服务器与qq互通聊天
需要在饥荒服务端中安装mod:DST TO QQ
需要onebot适配器
[部署详细教程](101.132.253.14/archives/143)
`
export interface Config {
  host: string
  dstPort: number
  botId: string
  groupId: string
  tag: string
}

export const Config: Schema<Config> = Schema.object({
  host: Schema.string().description('如果koishi和dst服务器在一台机器上则无需改动,更改后需要重启koishi').default('127.0.0.1'),
  dstPort: Schema.number().description('dst端口(一路444)').default(16444),
  botId: Schema.string().required().description('机器人的QQ号'),
  groupId: Schema.string().required().description('群号'),
  tag: Schema.string().description('以此符号开头的消息会被传到服务器中,为空的话每条消息都会进去').default('#'),
})

// 声明一个固定数组,缓存最近的指令消息
const messageArray = new FixedSizeArray(3);

// 外部变量，用于存储服务器实例
let server: http.Server | null = null;

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
      ctx.logger("dst-forward").info(userInfo + "addArray:" + session.content);
      messageArray.add(userInfo, session.content);
      return;
    }
    else if (session.content && session.content.charAt(0) === conf.tag) {
      ctx.logger("dst-forward").info(userInfo + "addArray:" + session.content);
      messageArray.add(userInfo, session.content.slice(1));
      return;
    }
  });

  // 仅在服务器未创建时创建服务器
  if (!server) {
    server = http.createServer((req, res) => {
      if (req.method === 'POST') {
        if (req.url === '/send_msg') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            const parsedBody = JSON.parse(body);  // 解析 JSON
            if (!parsedBody) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));  // 返回 400 错误
              return;
            }
            // 向群发送消息
            bot.internal.sendGroupMsg(conf.groupId, parsedBody.message.toString());
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));  // 返回 200 成功
          });
        } else if (req.url === '/get_msg') {
          // 直接返回缓存的消息
          res.writeHead(200, { 'Content-Type': 'application/json' });
          const messages = messageArray.getItems();
          messageArray.clear(); // 清空消息数组
          res.end(JSON.stringify({ messages })); // 返回消息数组
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not Found' }));  // 返回 404 错误
        }
      } else {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));  // 返回 405 错误
      }
    }).listen(conf.dstPort, conf.host, () => {
      ctx.logger("dst-forward").info(`Server running on http://${conf.host}:${conf.dstPort}`);
    });
  }
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
    ctx.logger("dst-forward").info(`收到 roll...`);
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
    ctx.logger("dst-forward").info(`收到 reset...`);
    await argv.session.send('警告,确定要重置整个世界吗？ (输入Y确认)')
    const confirm = await argv.session.prompt(20000)
    if (!confirm || confirm.toLowerCase() != 'y') return '已取消重置'
    messageArray.add('reset', '', true)
    return `正在重置世界...`
  } else if (argv.options.save) {
    ctx.logger("dst-forward").info(`收到 save...`);
    await argv.session.send('确定要保存吗？ (输入Y确认)')
    const confirm = await argv.session.prompt(20000)
    if (!confirm || confirm.toLowerCase() != 'y') return '已取消保存'
    messageArray.add('save', '', true)
    return `正在保存...`
  }
  return '未指定操作 输入dst --help查看命令详细'
}
// 文案完整性体检（验收 A5）：原稿每一句都必须原封不动出现在页面里
// 用法: node coverage.mjs <html路径>
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../v2/control-illusion-v2.html');

/* 原稿 32 句（来自「分镜文案」原文，一字不改） */
const ORIGINAL = [
  '你有没有发现一件很奇怪的事。',
  '同样是彩票，自己选的号码，总感觉更容易中奖。',
  '机选的，心里就觉得不靠谱。',
  '但从概率上来说，两组号码中奖概率完全一样。',
  '没有任何差别。',
  '你只是产生了一种错觉。',
  '心理学上，叫做控制错觉。',
  '我们会误以为，自己拥有选择权，就能掌控随机的结果。',
  '有一个很经典的心理学实验。',
  '研究人员让两组人参与彩票抽奖。',
  '一组可以自己挑选彩票。',
  '另一组只能拿别人分配好的。',
  '之后，实验者询问，愿不愿意卖掉手里的彩票。',
  '自己选号那一组，开出的售价，足足高出四倍。',
  '明明中奖概率相同。',
  '仅仅因为亲手选择，人们就高估了获胜的可能性。',
  '这种错觉无处不在。',
  '打球时，觉得自己手感来了，下一球一定能进。',
  '扔骰子前，用力搓一搓，默念想要的数字。',
  '炒股时，觉得自己判断对走势，可以掌控涨跌。',
  '本质上，这些结果很大程度带有随机性。',
  '但我们不愿意承认：很多事情，并不受我们掌控。',
  '为什么大脑会产生控制错觉？',
  '大脑讨厌不确定性。',
  '它渴望掌控感，这会带来安全感。',
  '哪怕这份掌控，只是虚假的。',
  '当我们亲手参与、做出选择，大脑就会自动放大我们的影响力。',
  '把随机的好运，当成自己能力带来的成果。',
  '分清能力和运气，是一种很重要的智慧。',
  '承认哪些事无法掌控。',
  '把精力留给真正能改变的部分。',
  '随机的世界里，不要被虚假的掌控感困住。'
];

const b = await launch({ width: 1920, height: 1080, port: 9380 });
try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  const res = await b.page.send('Runtime.evaluate', {
    expression: `(function(){
      var secs = document.querySelectorAll('.piece');
      var byScreen = {};
      for (var i = 0; i < secs.length; i++) {
        var s = secs[i].getAttribute('data-screen');
        byScreen[s] = (byScreen[s] || '') + secs[i].textContent;
      }
      var cap = document.getElementById('caption');
      var notes = (window.__screens ? window.__screens() : []).map(function(s){ return s.note; }).join('');
      return JSON.stringify({
        screens: byScreen,
        caption: cap.querySelector('.note').textContent + notes
      });
    })()`,
    returnByValue: true
  });
  const data = JSON.parse(res.result.value);
  const all = Object.keys(data.screens).map((k) => data.screens[k]).join('') + data.caption;
  const norm = (s) => s.replace(/[\s，。？！：；、·]/g, '');
  const hay = norm(all);

  let miss = 0;
  ORIGINAL.forEach((sentence, i) => {
    const ok = hay.indexOf(norm(sentence)) >= 0;
    if (!ok) { miss++; console.log(`❌ 缺失 #${i + 1}: ${sentence}`); }
  });
  console.log(`原稿句子 ${ORIGINAL.length} 句 → 缺失 ${miss} 句 ${miss ? '❌' : '✅'}`);
  console.log('页面文字总字数（去标点）:', hay.length);
} finally {
  await b.close();
}

const fs = require('fs');
const readline = require('readline');
const got = require('got');

const {
  SEND_TOKEN: token
} = process.env;

const [, , repo] = process.argv;

const client = got.extend({
  headers: {
    'User-Agent': 'Github Actions'
  },
  timeout: 10000,
  responseType: 'json'
});

const downloaders = [
  {
    type: '新番',
    remote: `https://api.github.com/repos/${repo}/contents/list.txt`,
    local: 'download-list.txt'
  },
  {
    type: '字幕',
    remote: `https://api.github.com/repos/${repo}/contents/subtitles.json`,
    local: 'download-sub-list.txt'
  }
];

async function push(list, remote, type) {
  if (!list) throw 'empty';
  const content = Buffer.from(list).toString('base64'),
    configLink = remote,
    body = {
      message: `${type}下载推送`,
      content
    },
    headers = {
      'Authorization': `token ${token}`
    };
  const response = await client.get(configLink, {
    headers
  });
  body.sha = response.body.sha;
  await client.put(configLink, {
    headers,
    json: body
  });
}

async function sendToDownload(remote, local, type) {
  let localFile;
  try {
    localFile = fs.createReadStream(local);
    const rl = readline.createInterface({
      input: localFile,
      crlfDelay: Infinity
    });
    let list = '', count = 0;
    for await (const line of rl) {
      list += `${line}\n`;
      count++;
      if (type === '新番' && count >= 12) {
        await push(list, remote, type);
        list = '';
        count = 0;
        await new Promise((res) => setTimeout(() => res(), 10000));
      }
    }
    if (list) await push(list, remote, type);
  }
  catch (e) {
    return 'empty';
  }
}

(async () => {
  try {
    for (const downloader of downloaders) {
      try {
        const result = await sendToDownload(downloader.remote, downloader.local, downloader.type);
        if (result === 'empty') console.log(`无新的${downloader.type}下载链接`);
        else console.log(`发送${downloader.type}下载链接成功`);
      }
      catch (error) {
        console.log(`发送${downloader.type}下载链接失败：`);
        console.log(error);
        if (error.response && error.response.body) console.log(error.response.body);
      }
      await new Promise((res) => setTimeout(() => res(), 2000));
    }
  }
  catch (error) {
    console.log('发送下载链接失败');
    console.log(error.toString());
    process.exit(1);
  }
})();

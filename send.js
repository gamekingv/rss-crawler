const fs = require('fs');
const request = require('request');

const {
  SEND_TOKEN: token
} = process.env;

const [, , repo] = process.argv;

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

async function sendToDownload(remote, local, type) {
  const content = Buffer.from(fs.readFileSync(local)).toString('base64'),
    configLink = remote,
    body = {
      message: `${type}下载推送`,
      content
    },
    headers = {
      'Authorization': `token ${token}`,
      'User-Agent': 'Github Actions'
    };
  if (!content) return 'empty';
  const response = await new Promise((res, rej) => {
    request(configLink, {
      headers,
      timeout: 10000
    }, function (error, response) {
      if (error) return rej(error);
      else res(response);
    });
  });
  body.sha = JSON.parse(response.body).sha;
  await new Promise((res, rej) => {
    request(configLink, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body: JSON.stringify(body),
      timeout: 10000
    }, function (error, response) {
      if (error) return rej(error);
      else res(response);
    });
  });
}

(async () => {
  try {
    for (const downloader of downloaders) {
      const result = await sendToDownload(downloader.remote, downloader.local, downloader.type);
      if (result === 'empty') console.log(`无新的${downloader.type}下载链接`);
      else console.log(`发送${downloader.type}下载链接成功`);
      await new Promise((res) => setTimeout(() => res(), 2000));
    }
  }
  catch (error) {
    console.log('发送下载链接失败');
    console.log(error.toString());
  }
})();
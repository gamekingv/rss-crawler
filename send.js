const fs = require('fs');
const fsp = fs.promises;
const readline = require('readline');
const got = require('got');

const {
  GITHUB_RUN_ID: run_id,
  GITHUB_REPOSITORY: repository,
  SEND_TOKEN: token,
  GITHUB_TOKEN: cancelToken
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

async function cancelWorkflow() {
  await client.post(`https://api.github.com/repos/${repository}/actions/runs/${run_id}/cancel`, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${cancelToken}`
    }
  });
  await new Promise((res) => setTimeout(() => res(), 60000));
}

async function push(list, remote, type) {
  if (!list) await cancelWorkflow();
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
    await fsp.stat(local);
  }
  catch (e) {
    await cancelWorkflow();
  }
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

(async () => {
  try {
    for (const downloader of downloaders) {
      try {
        await sendToDownload(downloader.remote, downloader.local, downloader.type);
        console.log(`发送${downloader.type}下载链接成功`);
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

const fs = require('fs').promises;
const Parser = require('rss-parser');
const got = require('got');

const downloadFolder = 'Offline/Anime_Offline';

const {
  GITHUB_REPOSITORY: repository,
  RSS_TOKEN: token
} = process.env;

const client = got.extend({
  headers: {
    'User-Agent': 'Github Actions'
  },
  timeout: 10000,
  responseType: 'json'
});

async function saveDownloadedList(filename, downloadedList) {
  let content = Buffer.from(downloadedList).toString('base64'),
    timeStamp = Date.now(),
    commitLink = `https://api.github.com/repos/${repository}/commits`,
    configLink = `https://api.github.com/repos/${repository}/contents/${filename}`,
    body = {
      message: `更新于${new Date(timeStamp).toLocaleString()}`,
      content
    },
    headers = {
      'Authorization': `token ${token}`
    };
  const response = await client.get(commitLink, {
    headers
  });
  tree_sha = response.body[0].commit.tree.sha;

  const treeResponse = await client.get(`https://api.github.com/repos/${repository}/git/trees/${tree_sha}`, {
    headers
  });
  const file = treeResponse.body.tree.find(file => file.path === filename);
  body.sha = file.sha;

  await client.put(configLink, {
    headers,
    json: body
  });
}

async function fetchSubs(source, id, indexes) {
  switch (source) {
    case 'bilibili': {
      const response = await client.get(`https://api.bilibili.com/pgc/web/season/section?season_id=${id}`);
      const info = response.body;
      const subtitles = {};
      for (const index of indexes) {
        const episode = info.result.main_section.episodes.find(episode => `${episode.title}` === `${index}`);
        if (episode) {
          const { aid, cid } = episode;
          const response = await client.get(`https://api.bilibili.com/x/player/v2?cid=${cid}&aid=${aid}`);
          let subnode = response.body.data.subtitle;
          if (subnode) {
            if (subnode.subtitles.length === 0) console.log('无字幕');
            else {
              subtitles[index] = {};
              subnode.subtitles.forEach(subtitle => subtitles[index][subtitle.lan] = `https:${subtitle.subtitle_url}`);
            }
          }
          else console.log('获取字幕下载链接失败');
        }
      }
      return subtitles;
    }
  }
}

(async () => {
  try {
    const { sources } = JSON.parse(await fs.readFile('sources.json'));
    let data;
    try {
      data = JSON.parse(await fs.readFile('downloaded.json'));
    }
    catch (e) {
      data = { downloaded: [] };
    }
    const original = JSON.stringify(data);
    const downloaded = data.downloaded.filter(e => sources.some(source => source.rss === e.rss));
    let list = '';
    const downloadLists = [];
    const downloadSubsList = [];
    for (const source of sources) {
      if (!source.rss) {
        console.log('源缺乏rss参数');
        continue;
      }
      const downloadList = { rss: source.rss, list: [] };
      const sourceVideoIndexMatch = source.videoIndexMatch;
      const sourceSubNameParser = source.subNameParser;
      downloadLists.push(downloadList);
      let RSSDownloadedList = downloaded.find(item => item.rss === source.rss);
      if (!RSSDownloadedList) {
        RSSDownloadedList = {
          rss: source.rss,
          anime: []
        };
        downloaded.push(RSSDownloadedList);
      }
      RSSDownloadedList.anime = RSSDownloadedList.anime.filter(e => source.anime.some(info => info.folder === e.folder));
      const response = await client.get(source.rss, {
        timeout: 60000,
        responseType: undefined
      });
      const parser = source.parserOptions ? new Parser(source.parserOptions) : new Parser();
      const result = await parser.parseString(response.body);
      const titleLabel = source.titleLabel || 'title';
      const downloadLabel = source.downloadLabel || 'link';
      for (const info of source.anime) {
        if (!info.filters || info.filters.length === 0) continue;
        let animeDownloadedList = RSSDownloadedList.anime.find(item => item.folder === info.folder);
        if (!animeDownloadedList) {
          animeDownloadedList = {
            'folder': info.folder || '未命名番剧',
            'list': []
          };
          RSSDownloadedList.anime.push(animeDownloadedList);
        }
        const items = info.filters.reduce((filterItems, filter) =>
          filterItems.filter(item => {
            const parseFilter = filter.match(/^\/(.*)\/([ig]{0,2})$/);
            if (parseFilter) {
              const [, reg, flag] = parseFilter;
              return new RegExp(reg, flag).test(item[titleLabel]);
            }
            else return item[titleLabel].includes(filter);
          }),
          result.items
        );
        const unReadItems = items.filter(item => animeDownloadedList.list.every(title => title !== item[titleLabel]));
        const downloadURLs = unReadItems.map(item => downloadLabel.split('.').reduce((value, key) => value[key], item));
        downloadURLs.forEach(url => list += `${url}\n  dir=${downloadFolder}/${info.folder}\n`);
        animeDownloadedList.list.push(...unReadItems.map(item => item[titleLabel]));
        downloadList.list.push(...unReadItems.map(item => item[titleLabel]));
        if (info.subs) {
          const { source = 'bilibili', id, videoIndexMatch, subNameParser, delay = 0 } = info.subs;
          if (source && id && (videoIndexMatch || sourceVideoIndexMatch)) {
            const { regexp, index = 1 } = videoIndexMatch || sourceVideoIndexMatch;
            const episodes = animeDownloadedList.list.map(video => {
              try {
                return {
                  name: video,
                  index: video.match(new RegExp(regexp.replace(/^\/(.*)\/i?$/, '$1')))[index]
                };
              }
              catch (e) { console.log(`${video}字幕匹配表达式出错`); }
            });
            if (!animeDownloadedList.subs) animeDownloadedList.subs = {};
            const episodeIndexes = episodes.map(e => e.index).filter(index =>
              Object.keys(animeDownloadedList.subs).every(e => e !== index)
            );
            const subtitles = await fetchSubs(source, id, episodeIndexes);
            if (subtitles) {
              Object.assign(animeDownloadedList.subs, subtitles);
              const nameParser = subNameParser || sourceSubNameParser || [];
              downloadSubsList.push(...Object.entries(subtitles).map(([key, sub]) => Object.entries(sub).map(([tag, url]) => ({
                name: `${nameParser.reduce(((result, [match, replace]) => {
                  const parseFilter = match.match(/^\/(.*)\/([ig]{0,2})$/);
                  if (parseFilter) {
                    const [, reg, flag] = parseFilter;
                    return result.replace(new RegExp(reg, flag), replace);
                  }
                  else return result.replace(match, replace);
                }), episodes.find(({ index }) => index === key).name)}.${tag}.srt`,
                path: `${downloadFolder}/${info.folder}`,
                url,
                delay
              }))).flat());
            }
          }
        }
      }
    }
    if (original === JSON.stringify({ downloaded })) {
      console.log('');
      console.log('无更新');
      return;
    }
    await saveDownloadedList('downloaded.json', JSON.stringify({ downloaded }, null, 2));
    await fs.writeFile('download-list.txt', list);
    if (downloadSubsList.length > 0) await fs.writeFile('download-sub-list.txt', JSON.stringify(downloadSubsList, null, 2));
    else await fs.writeFile('download-sub-list.txt', '');
    console.log('即将开始下载：');
    let mailContent = '';
    downloadLists.forEach(downloadList => {
      if (downloadList.list.length > 0) {
        console.log('');
        console.log('RSS源：' + downloadList.rss);
        mailContent += `\nRSS源：${downloadList.rss}\n`;
        downloadList.list.forEach(item => {
          console.log(item);
          mailContent += `${item}\n`;
        });
      }
    });
    if (downloadSubsList.length > 0) {
      console.log('');
      console.log('字幕：');
      downloadSubsList.forEach(sub => console.log(sub.name));
    }
    if (mailContent !== '') await fs.writeFile('mail-content.txt', `已推送下载：\n${mailContent}`);
  }
  catch (error) {
    console.log(error);
    if (error.response && error.response.body) console.log(error.response.body);
    process.exit(1);
  }
})();

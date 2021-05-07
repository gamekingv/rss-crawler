# rss-crawler

## source.json说明
```javascript
{
  // 源数组，每个元素为一个源
  sources: [
    {
      // 必须项，RSS源的链接
      rss: '',

      // 可选项，默认为"link"，下载链接的标签路径，使用js的链式调用语法，如动漫花园为"enclosure.url"
      downloadLabel: '',

      // 可选项，默认为"title"，标题的标签路径，使用方式同downloadLabel
      titleLabel: '',

      // 可选项，rss-parser的设置，如遇到设置了downloadLabel或titleLabel而无法获取，
      // 可能为非标准标签rss-parser无处理，可通过设置rss-parser参数来处理，详见rss-parser文档
      parserOptions: {},

      // 可选项，匹配番剧视频集数的规则，如配置字幕拉取则源配置下或具体anime下subs中需至少配置一处，
      // 优先使用subs中的配置，如subs中没配置，则使用源的配置
      videoIndexMatch: {
        // regexp为匹配的正则表达式，必须项，使用类似filters的正则表达式，index为子表达式序号，不设置默认为1
        regexp: '',
        index: 1
      },

      // 关注的番剧列表，每个元素为一个对应一个番剧匹配规则
      anime: [
        {
          // 可选项，番剧下载文件夹，多个元素文件夹相同表示下载到同一个文件夹中，
          // 比如想下载多个字幕组同一番剧，可添加多个具有相同folder属性不同过滤规则的元素到anime列表中，
          // 不设置则默认下载到"未命名番剧"文件夹，强烈建议设置
          folder: '',

          // 必须项，过滤器，是一个字符串数组，标题包含filters中所有字符串则判定符合下载条件，
          // 支持正则表达式，形式如："/te.*?st/"，只支持i修饰符，不设置过滤器则忽略该anime元素
          filters: [],

          // 可选项，番剧字幕拉取信息
          subs: {
            // 可选项，字幕来源，目前只支持"bilibili"
            source: 'bilibili',

            // 必须项，字幕来源id，bilibili对应的是番剧的season_id
            id: 0,

            // 可选项，说明见source下的videoIndexMatch
            videoIndexMatch: {
              // regexp为匹配的正则表达式，必须项，使用类似filters的正则表达式，index为子表达式序号，不设置默认为1
              regexp: '',
              index: 1
            },

            // 可选项，指字幕整体平移时间，默认为0表示不平移，需要延后配置为正数，提前则为负数，单位为秒
            delay: 0
          }
        }
        ...
      ]
    }
    ...
  ]
}
```

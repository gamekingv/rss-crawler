const got = require('got');

const {
  GITHUB_REPOSITORY: repository,
  CLEAR_TOKEN: token
} = process.env;

const client = got.extend({
  headers: {
    'User-Agent': 'Github Actions',
    'Accept': 'application/vnd.github.v3+json',
    'Authorization': `token ${token}`
  },
  timeout: 10000,
  responseType: 'json',
  hooks: {
    afterResponse: [(response) => {
      const { headers } = response;
      const api_limit_remaining = Number(headers['x-ratelimit-remaining']);
      if (api_limit_remaining <= 100) {
        console.log(`API 调用次数剩余 ${api_limit_remaining}，暂停任务`);
        throw '';
      }
      else return response;
    }]
  }
});

(async () => {
  try {
    const { body } = await client.get(`https://api.github.com/repos/${repository}/actions/runs`);
    const now = Date.now(), remain_day = 7;
    let workflow_count = body.total_count;
    let remain = 0, reach_newest = false;
    while (workflow_count > 1 && !reach_newest) {
      let deleted = 0;
      const { body } = await client.get(`https://api.github.com/repos/${repository}/actions/runs`, {
        searchParams: {
          per_page: 100,
          page: Math.ceil(workflow_count / 100) - Math.ceil(remain / 100)
        }
      });
      workflow_count = body.total_count;
      const completed_workflows = body.workflow_runs.filter(workflow => workflow.status === 'completed');
      remain += 100 - completed_workflows.length;
      for (const workflow of completed_workflows) {
        if (now - new Date(workflow.created_at).getTime() <= remain_day * 24 * 60 * 60 * 1000) {
          reach_newest = true;
          break;
        }
        try {
          await client.delete(`https://api.github.com/repos/${repository}/actions/runs/${workflow.id}`);
          console.log(`删除 ${workflow.id}`);
          deleted++;
        }
        catch (error) {
          console.log(`删除 ${workflow.id} 失败`);
          remain++;
        }
        await new Promise(res => setTimeout(() => res(), 500));
      }
      workflow_count -= deleted;
    }
  }
  catch (error) {
    if (!error.response || error.response.statusCode >= 300) console.log(error);
    if (error.response && error.response.statusCode >= 300 && error.response.body) console.log(error.response.body);
    process.exit(1);
  }
})();
// 手帐模板配置
export const noteTemplates = Object.freeze([
  {
    id: "daily_diary",
    name: "每日日记",
    description: "记录一天的心情与经历",
    fields: {
      title: "{{date}} 日记",
      content: `今日心情：\n\n重要事件：\n\n感悟收获：\n\n明日计划：\n\n`,
      tags: ["日常", "心情"],
    },
  },
  {
    id: "todo_item",
    name: "单项待办事项",
    description: "记录一件具体要完成的任务，专注执行不遗漏",
    fields: {
      title: "任务：XXX",
      content: `任务详情：\n\n截止时间：\n\n是否完成：\n\n完成备注：\n\n`,
      tags: ["计划"],
    },
  },
  {
    id: "todo_list",
    name: "今日事项清单",
    description: "写下要做的事，完成一项划掉一项",
    fields: {
      title: "{{date}} 待办事项",
      content: `【必做】\n1.\n2.\n3.\n\n【选做】\n1.\n2.\n\n【小结】\n\n`,
      tags: ["计划"],
    },
  },
  {
    id: "finance_journal",
    name: "收支追踪表",
    description: "清晰记录每笔收支，掌控现金流",
    fields: {
      title: "{{date}} 收支记录",
      content: `【收入明细】
来源 | 金额
示例：兼职设计 20.00
1. 
2. 

【支出明细】
类别-项目 | 金额
示例：餐饮-早餐 15.00
1. 
2. 
3. 
4. 
5. 

【财务快览】
今日总收入：
今日总支出：
当日结余：

【备注与规划】

`,
      tags: ["理财"],
    },
  },
  {
    id: "travel_log",
    name: "旅行记录",
    description: "记录旅行见闻与感受",
    fields: {
      title: "XXX旅行记",
      content: `目的地：\n\n行程安排：\n\n美食推荐：\n\n美景分享：\n\n旅行感悟：\n\n`,
      tags: ["旅行", "美食"],
    },
  },
  {
    id: "creative_ideas",
    name: "创意灵感本",
    description: "捕捉脑洞碎片，让灵感不再溜走",
    fields: {
      title: "灵感火花 {{date}}",
      content: `触发点：\n\n脑洞点子：\n1. \n2. \n\n下一步行动：\n`,
      tags: ["学习"],
    },
  },
  {
    id: "reading_notes",
    name: "读书笔记",
    description: "记录读书心得与摘抄",
    fields: {
      title: "《XXX》读书笔记",
      content: `书籍信息：\n作者：\n出版时间：\n\n核心观点：\n\n精彩摘抄：\n\n个人感悟：\n`,
      tags: ["学习"],
    },
  },
  {
    id: "weekly_plan",
    name: "周计划",
    description: "制定一周计划与目标",
    fields: {
      title: "第{{week}}周计划",
      content: `本周目标：\n1.\n2.\n3.\n\n每日安排：\n周一：\n周二：\n周三：\n周四：\n周五：\n周六：\n周日：\n\n自我激励：\n`,
      tags: ["计划", "成长"],
    },
  },
  {
    id: "work_summary",
    name: "工作总结",
    description: "记录工作进展与反思",
    fields: {
      title: "{{date}} 工作总结",
      content: `今日完成：\n1.\n2.\n3.\n\n遇到的问题：\n\n解决方案：\n\n明日计划：\n`,
      tags: ["工作", "成长"],
    },
  },
  {
    id: "health_tracking",
    name: "健康追踪",
    description: "记录健康数据与运动情况",
    fields: {
      title: "{{date}} 健康记录",
      content: `睡眠情况：\n小时：\n质量：\n\n饮食记录：\n早餐：\n午餐：\n晚餐：\n\n运动情况：\n\n身体感受：\n`,
      tags: ["健康", "日常"],
    },
  },
  {
    id: "movie_review",
    name: "观影记录",
    description: "记录电影观后感",
    fields: {
      title: "《XXX》观后感",
      content: `电影信息：\n导演：\n主演：\n评分：\n\n剧情简介：\n\n个人评价：\n\n推荐指数：\n`,
      tags: ["日常"],
    },
  },
  {
    id: "social_events",
    name: "社交能量记录",
    description: "记录和朋友相处的充电时刻，告别社交耗电",
    fields: {
      title: "{{date}} 社交小确幸",
      content: `活动类型：\n\n能量变化：\n\n收获的笑点：\n\n下次想约的人：\n`,
      tags: ["日常"],
    },
  },
  {
    id: "goal_planner",
    name: "目标规划",
    description: "规划目标，分解任务，稳步前进",
    fields: {
      title: "目标：XXX",
      content: `目标描述：

具体行动步骤：
1. 
2. 
3. 

时间节点：

可能的障碍：

克服方案：

激励自己的话：
      `,
      tags: ["目标"],
    },
  },
  {
    id: "dream_list",
    name: "梦想加油站",
    description: "把梦想写下来，让它慢慢发光",
    fields: {
      title: "梦想加油站",
      content: `梦想清单：\n\n为什么要实现这个梦想：\n\n行动计划：\n1. \n2. \n\n需要的资源：\n1. 资金\n2. 时间\n3. 人\n`,
      tags: ["成长"],
    },
  },
  {
    id: "food_journal",
    name: "美食记录",
    description: "记录美食尝试与评价",
    fields: {
      title: "{{date}} 美食记录",
      content: `美食名称：\n\n评价：\n1. \n2. \n3. \n\n下次要品尝的美食：\n\n`,
      tags: ["美食", "日常"],
    },
  },
  {
    id: "meeting_journal",
    name: "会议记录",
    description: "记录会议内容与总结",
    fields: {
      title: "{{date}} 会议记录",
      content: `会议主题：\n\n参与人员：\n\n会议内容：\n\n会议总结：\n`,
      tags: ["会议", "日常"],
    },
  },
]);

// 根据ID获取模板
export const getTemplateById = (id: string) => {
  return noteTemplates.find((template) => template.id === id);
};

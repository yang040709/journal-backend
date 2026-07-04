export type FeedbackQuickReplyItem = {
  id: string;
  label: string;
  content: string;
  sortOrder: number;
  enabled: boolean;
};

export const FEEDBACK_QUICK_REPLIES_SEED: FeedbackQuickReplyItem[] = [
  {
    id: "seed_thanks",
    label: "感谢反馈",
    content: "感谢您的反馈，我们已收到并会认真处理。",
    sortOrder: 0,
    enabled: true,
  },
  {
    id: "seed_bug_fixed",
    label: "Bug 已修复",
    content: "您反馈的问题已在最新版本中修复，感谢耐心等候。",
    sortOrder: 1,
    enabled: true,
  },
  {
    id: "seed_demand_recorded",
    label: "需求已记录",
    content: "您的需求已记录，后续版本会纳入评估，感谢建议。",
    sortOrder: 2,
    enabled: true,
  },
  {
    id: "seed_praise",
    label: "感谢点赞",
    content: "感谢您的鼓励与支持，我们会继续努力！",
    sortOrder: 3,
    enabled: true,
  },
];

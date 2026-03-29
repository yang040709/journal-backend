/**
 * 与上传额度等业务共用的「自然日」键（yyyy-MM-dd），时区默认与 UPLOAD_QUOTA_TIMEZONE 一致。
 */
export const getDateKeyByTimezone = (timezone: string): string => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
};

export const getQuotaDateContext = () => {
  const timezone = process.env.UPLOAD_QUOTA_TIMEZONE || "Asia/Shanghai";
  const dateKey = getDateKeyByTimezone(timezone);
  return { timezone, dateKey };
};

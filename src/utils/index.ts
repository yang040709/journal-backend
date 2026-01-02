export const createResponse = (data?: any) => {
  return {
    code: 0,
    message: "success",
    data,
  };
};
export const createError = (message: string, code: number = -1) => {
  return {
    code,
    message,
  };
};

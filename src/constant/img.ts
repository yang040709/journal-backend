const coverList = [
  "cover-0e981cfd.jpeg",
  "cover-ce185cac.jpeg",
  "cover-a1791921.jpeg",
  "cover-66836a0e.jpeg",
  "cover-1a50a91d.jpeg",
  "cover-9f1b91b7.jpeg",
  "cover-2aae7e4a.jpeg",
  "cover-e5995c3f.jpeg",
  "cover-693db757.jpeg",
  "cover-adf1990d.jpeg",
  "cover-60c64796.jpeg",
  "cover-ec4eb52d.jpeg",
];

// const prefix = "https://cdn.jsdelivr.net/gh/yang040709/image@main/cover4";
export const prefix =
  "https://wx-image-1379860077.cos-website.ap-guangzhou.myqcloud.com/";

export const coverPreviewList = Object.freeze(
  coverList.map((item) => {
    return prefix + item;
  })
);

export const defaultNoteBook = [
  {
    title: "日常碎片",
    coverImg: coverPreviewList[0],
  },
  {
    title: "心情日记",
    coverImg: coverPreviewList[4],
  },
  {
    title: "目标打卡",
    coverImg: coverPreviewList[7],
  },
  {
    title: "旅行足迹",
    coverImg: coverPreviewList[5],
  },
];

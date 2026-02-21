const coverList = [
  "cover-2247fe8d.jpeg",
  "cover-693db757.jpeg", //10
  "cover-908de6f7.jpeg", //3
  "cover-b944b080.jpeg", //4
  "cover-a1791921.jpeg", //1
  "cover-86e51f6a.jpeg", //5
  "cover-ec858fab.jpeg", //7
  "cover-886e27d8.jpeg",
  "cover-641c6c27.jpeg",
  "cover-1a50a91d.jpeg", //9
  "cover-60c64796.jpeg", //11
  "cover-132156f1.jpeg",
  "cover-ec4eb52d.jpeg", //12
  "cover-2b7afe41.jpeg", //13
  "cover-ce185cac.jpeg", //2
  // 以下是新增的未标记 ok 的图片
  "cover-4af9435d.jpeg", //8
  "cover-0e981cfd.jpeg",
  "cover-66836a0e.jpeg",
  "cover-9f1b91b7.jpeg",
  "cover-2aae7e4a.jpeg",
  "cover-e5995c3f.jpeg",
  "cover-adf1990d.jpeg",
  "cover-f3e60193.jpeg",
  "cover-b6567375.jpeg",
  "cover-03b88a9c.jpeg",
  "cover-0408c2ad.jpeg",
  "cover-40eb796d.jpeg",
  "cover-0e29e32c.jpeg",
  "cover-8272af04.jpeg",
  "cover-dc9821d5.jpeg",
  "cover-731c0593.jpeg",
  "cover-3e9243c8.jpeg", //6
  "cover-d250120c.jpeg",
  "cover-c26aaf8a.jpeg",
  "cover-ff7907ce.jpeg",
  "cover-4824693b.jpeg",
  "cover-cda998f3.jpeg",
  "cover-3360dc48.jpeg",
  "cover-7d24e6eb.jpeg",
  "cover-d4ca1c8b.jpeg",
];

export const prefix = "https://img.leyang.asia/";

export const coverPreviewList = Object.freeze(
  coverList.map((item) => {
    return prefix + item;
  }),
);

export const defaultNoteBook = [
  {
    title: "日常碎片",
    coverImg: coverPreviewList[10],
  },
  {
    title: "心情日记",
    coverImg: coverPreviewList[1],
  },
  {
    title: "目标打卡",
    coverImg: coverPreviewList[7],
  },
  {
    title: "旅行足迹",
    coverImg: coverPreviewList[11],
  },
];

// [
//   "cover-0e981cfd.jpeg",
//   "cover-ce185cac.jpeg",
//   "cover-a1791921.jpeg",
//   "cover-66836a0e.jpeg",
//   "cover-1a50a91d.jpeg",
//   "cover-9f1b91b7.jpeg",
//   "cover-2aae7e4a.jpeg",
//   "cover-e5995c3f.jpeg",
//   "cover-693db757.jpeg",
//   "cover-adf1990d.jpeg",
//   "cover-60c64796.jpeg",
//   "cover-ec4eb52d.jpeg",
//   "cover-f3e60193.jpeg",
//   "cover-b6567375.jpeg",
//   "cover-2b7afe41.jpeg",
//   "cover-03b88a9c.jpeg",
//   "cover-0408c2ad.jpeg",
//   "cover-40eb796d.jpeg",
//   "cover-0e29e32c.jpeg",
//   "cover-641c6c27.jpeg",
//   "cover-8272af04.jpeg",
//   "cover-dc9821d5.jpeg",
//   "cover-731c0593.jpeg",
//   "cover-908de6f7.jpeg",
//   "cover-b944b080.jpeg",
//   "cover-86e51f6a.jpeg",
//   "cover-886e27d8.jpeg",
//   "cover-d250120c.jpeg",
//   "cover-3e9243c8.jpeg",
//   "cover-c26aaf8a.jpeg",
//   "cover-2247fe8d.jpeg",
//   "cover-ff7907ce.jpeg",
//   "cover-4824693b.jpeg",
//   "cover-cda998f3.jpeg",
//   "cover-3360dc48.jpeg",
//   "cover-132156f1.jpeg",
//   "cover-7d24e6eb.jpeg",
//   "cover-d4ca1c8b.jpeg",
//   "cover-4af9435d.jpeg",
//   "cover-ec858fab.jpeg",
// ];

/* 
 [
  "cover-a1791921.jpeg",
  "cover-ce185cac.jpeg",
  "cover-641c6c27.jpeg",
  "cover-908de6f7.jpeg",
  "cover-b944b080.jpeg",
  "cover-86e51f6a.jpeg",
  "cover-3e9243c8.jpeg",
  "cover-4af9435d.jpeg",
  "cover-1a50a91d.jpeg",
  "cover-693db757.jpeg",
  "cover-60c64796.jpeg",
  "cover-ec4eb52d.jpeg",
  "cover-2b7afe41.jpeg",
];
*/

// const coverList = [
//   "cover-0e981cfd.jpeg",
//   "cover-ce185cac.jpeg",ok
//   "cover-a1791921.jpeg",ok
//   "cover-66836a0e.jpeg",
//   "cover-1a50a91d.jpeg",ok
//   "cover-9f1b91b7.jpeg",
//   "cover-2aae7e4a.jpeg",
//   "cover-e5995c3f.jpeg",
//   "cover-693db757.jpeg",ok
//   "cover-adf1990d.jpeg",
//   "cover-60c64796.jpeg",ok
//   "cover-ec4eb52d.jpeg",ok
//   "cover-f3e60193.jpeg",
//   "cover-b6567375.jpeg",
//   "cover-2b7afe41.jpeg",ok
//   "cover-03b88a9c.jpeg",
//   "cover-0408c2ad.jpeg",
//   "cover-40eb796d.jpeg",
//   "cover-0e29e32c.jpeg",
//   "cover-641c6c27.jpeg",ok
//   "cover-8272af04.jpeg",
//   "cover-dc9821d5.jpeg",
//   "cover-731c0593.jpeg",
//   "cover-908de6f7.jpeg",ok
//   "cover-b944b080.jpeg",ok
//   "cover-86e51f6a.jpeg",ok
//   "cover-886e27d8.jpeg",
//   "cover-d250120c.jpeg",
//   "cover-3e9243c8.jpeg",ok
//   "cover-c26aaf8a.jpeg",
//   "cover-2247fe8d.jpeg",
//   "cover-ff7907ce.jpeg",
//   "cover-4824693b.jpeg",
//   "cover-cda998f3.jpeg",
//   "cover-3360dc48.jpeg",
//   "cover-132156f1.jpeg",
//   "cover-7d24e6eb.jpeg",
//   "cover-d4ca1c8b.jpeg",
//   "cover-4af9435d.jpeg", ok
//   "cover-ec858fab.jpeg",
// ];

/* 
 [
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


[
  "cover-f3e60193.jpeg",
  "cover-b6567375.jpeg",
  "cover-2b7afe41.jpeg",
  "cover-03b88a9c.jpeg",
  "cover-0408c2ad.jpeg",
  "cover-40eb796d.jpeg",
  "cover-0e29e32c.jpeg",
  "cover-641c6c27.jpeg",
  "cover-8272af04.jpeg",
  "cover-dc9821d5.jpeg",
  "cover-731c0593.jpeg",
  "cover-908de6f7.jpeg",
  "cover-b944b080.jpeg",
  "cover-86e51f6a.jpeg",
  "cover-886e27d8.jpeg",
  "cover-d250120c.jpeg",
  "cover-3e9243c8.jpeg",
  "cover-c26aaf8a.jpeg",
  "cover-2247fe8d.jpeg",
  "cover-ff7907ce.jpeg",
  "cover-4824693b.jpeg",
  "cover-cda998f3.jpeg",
  "cover-3360dc48.jpeg",
  "cover-132156f1.jpeg",
  "cover-7d24e6eb.jpeg",
  "cover-d4ca1c8b.jpeg",
  "cover-4af9435d.jpeg",
  "cover-ec858fab.jpeg"
]


[
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
  "cover-f3e60193.jpeg",
  "cover-b6567375.jpeg",
  "cover-2b7afe41.jpeg",
  "cover-03b88a9c.jpeg",
  "cover-0408c2ad.jpeg",
  "cover-40eb796d.jpeg",
  "cover-0e29e32c.jpeg",
  "cover-641c6c27.jpeg",
  "cover-8272af04.jpeg",
  "cover-dc9821d5.jpeg",
  "cover-731c0593.jpeg",
  "cover-908de6f7.jpeg",
  "cover-b944b080.jpeg",
  "cover-86e51f6a.jpeg",
  "cover-886e27d8.jpeg",
  "cover-d250120c.jpeg",
  "cover-3e9243c8.jpeg",
  "cover-c26aaf8a.jpeg",
  "cover-2247fe8d.jpeg",
  "cover-ff7907ce.jpeg",
  "cover-4824693b.jpeg",
  "cover-cda998f3.jpeg",
  "cover-3360dc48.jpeg",
  "cover-132156f1.jpeg",
  "cover-7d24e6eb.jpeg",
  "cover-d4ca1c8b.jpeg",
  "cover-4af9435d.jpeg",
  "cover-ec858fab.jpeg"
]
*/

// const prefix = "https://cdn.jsdelivr.net/gh/yang040709/image@main/cover4";
// export const prefix =
//   "https://wx-image-1379860077.cos-website.ap-guangzhou.myqcloud.com/";

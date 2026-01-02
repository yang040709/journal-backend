const axios = require("axios");

const BASE_URL = "http://localhost:3000";
const TEST_USER_ID = "test_user_123";
const TEST_TOKEN = "test_token_123";

// 创建测试数据
const testData = {
  version: "2.0.0",
  exportTime: new Date().toISOString(),
  appName: "手帐测试",
  data: {
    noteBooks: [
      {
        _id: "test_notebook_1",
        title: "测试手帐本1",
        description: "这是一个测试手帐本",
        coverImage: "https://example.com/image1.jpg",
        tags: ["测试", "工作"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: TEST_USER_ID,
      },
      {
        _id: "test_notebook_2",
        title: "测试手帐本2",
        description: "这是另一个测试手帐本",
        coverImage: "https://example.com/image2.jpg",
        tags: ["测试", "生活"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: TEST_USER_ID,
      },
    ],
    notes: [
      {
        _id: "test_note_1",
        title: "测试手帐1",
        content: "这是测试手帐的内容",
        notebookId: "test_notebook_1",
        tags: ["测试", "工作"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: TEST_USER_ID,
      },
      {
        _id: "test_note_2",
        title: "测试手帐2",
        content: "这是另一个测试手帐的内容",
        notebookId: "test_notebook_2",
        tags: ["测试", "生活"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: TEST_USER_ID,
      },
    ],
  },
  statistics: {
    noteBookCount: 2,
    noteCount: 2,
  },
};

async function testExportImport() {
  console.log("=== 开始测试导入导出功能 ===\n");

  try {
    // 1. 测试导出接口
    console.log("1. 测试导出接口...");
    try {
      const exportResponse = await axios.get(`${BASE_URL}/export/data`, {
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
      });
      console.log("✅ 导出接口测试成功");
      console.log(`   状态码: ${exportResponse.status}`);
      console.log(
        `   数据大小: ${JSON.stringify(exportResponse.data).length} 字节\n`
      );
    } catch (error) {
      console.log("❌ 导出接口测试失败:", error.message);
      if (error.response) {
        console.log(`   状态码: ${error.response.status}`);
        console.log(`   错误信息: ${JSON.stringify(error.response.data)}`);
      }
    }

    // 2. 测试导入接口（替换模式）
    console.log("2. 测试导入接口（替换模式）...");
    try {
      const importResponse = await axios.post(
        `${BASE_URL}/export/import?mode=replace&conflictStrategy=overwrite`,
        testData,
        {
          headers: {
            Authorization: `Bearer ${TEST_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("✅ 导入接口测试成功（替换模式）");
      console.log(`   状态码: ${importResponse.status}`);
      console.log(`   响应: ${JSON.stringify(importResponse.data, null, 2)}\n`);
    } catch (error) {
      console.log("❌ 导入接口测试失败（替换模式）:", error.message);
      if (error.response) {
        console.log(`   状态码: ${error.response.status}`);
        console.log(
          `   错误信息: ${JSON.stringify(error.response.data, null, 2)}`
        );
      }
    }

    // 3. 测试导入接口（合并模式）
    console.log("3. 测试导入接口（合并模式）...");
    try {
      const importResponse = await axios.post(
        `${BASE_URL}/export/import?mode=merge&conflictStrategy=skip`,
        testData,
        {
          headers: {
            Authorization: `Bearer ${TEST_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("✅ 导入接口测试成功（合并模式）");
      console.log(`   状态码: ${importResponse.status}`);
      console.log(`   响应: ${JSON.stringify(importResponse.data, null, 2)}\n`);
    } catch (error) {
      console.log("❌ 导入接口测试失败（合并模式）:", error.message);
      if (error.response) {
        console.log(`   状态码: ${error.response.status}`);
        console.log(
          `   错误信息: ${JSON.stringify(error.response.data, null, 2)}`
        );
      }
    }

    // 4. 测试参数验证
    console.log("4. 测试参数验证...");
    try {
      const invalidData = { ...testData };
      delete invalidData.data; // 删除必要字段

      const importResponse = await axios.post(
        `${BASE_URL}/export/import`,
        invalidData,
        {
          headers: {
            Authorization: `Bearer ${TEST_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("❌ 参数验证测试失败：应该返回错误但成功了");
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log("✅ 参数验证测试成功：正确返回了400错误");
        console.log(
          `   错误信息: ${JSON.stringify(error.response.data, null, 2)}`
        );
      } else {
        console.log("❌ 参数验证测试失败：", error.message);
      }
    }

    console.log("\n=== 测试完成 ===");
  } catch (error) {
    console.error("测试过程中发生错误:", error);
  }
}

// 运行测试
testExportImport();

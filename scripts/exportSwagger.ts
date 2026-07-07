import fs from "fs";
import path from "path";
// @ts-ignore
import SwaggerJSdoc from "swagger-jsdoc";
// @ts-ignore
import swaggerOptions from "../src/config/swaggerOptions.ts";

const specs = SwaggerJSdoc(swaggerOptions);

const outputDir = path.resolve(process.cwd(), "..", "docs", "spec", "openapi");
const outputPath = path.join(outputDir, "openapi.json");

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(specs, null, 2), "utf-8");

console.log(`✅ Swagger 文档已成功导出至: ${outputPath}`);

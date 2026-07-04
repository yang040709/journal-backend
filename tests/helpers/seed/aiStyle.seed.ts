import AiStyle from "../../../src/model/AiStyle";
import { AI_STYLE_SEED } from "../../../src/constant/aiStyleSeed";

export async function seedDefaultAiStyle() {
  const seed = AI_STYLE_SEED.find((item) => item.isDefault) ?? AI_STYLE_SEED[0];
  await AiStyle.create({
    styleKey: seed.styleKey,
    name: seed.name,
    subtitle: seed.subtitle,
    category: seed.category,
    order: seed.order,
    enabled: seed.enabled,
    isDefault: seed.isDefault,
    isRecommended: seed.isRecommended,
    systemPrompt: seed.systemPrompt,
    userPromptTemplate: seed.userPromptTemplate,
    modePrompts: seed.modePrompts,
    maxOutputChars: seed.maxOutputChars,
    emojiPolicy: seed.emojiPolicy,
  });
  return seed.styleKey;
}

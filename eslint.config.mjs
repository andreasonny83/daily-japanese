import nextPlugin from "eslint-config-next";
import prettierConfig from "eslint-config-prettier";

const eslintConfig = [
  ...nextPlugin,
  prettierConfig,
  {
    ignores: ["drizzle/**", "node_modules/**", ".next/**", ".remember/**"],
  },
];

export default eslintConfig;

import next from "eslint-config-next";

// eslint-config-next 16 ships a native flat config (core-web-vitals + typescript
// combined). Import and spread it directly — FlatCompat is no longer needed.
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "next-env.d.ts",
      "supabase/**",
      "public/**",
    ],
  },
  ...next,
];

export default eslintConfig;

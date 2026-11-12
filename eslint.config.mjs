import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: ["mockups/**", "spike/out/**", "spike/browser/dist/**", ".next/**", "public/**"] },
];

export default config;

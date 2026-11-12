import next from "eslint-config-next";

export default [
  ...next,
  { ignores: ["mockups/**", "spike/out/**", "spike/browser/dist/**", ".next/**", "public/**"] },
];

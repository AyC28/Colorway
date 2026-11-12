import next from "eslint-config-next";

const config = [
  ...next,
  // thumbnails are local blob: URLs that next/image cannot optimise
  { files: ["src/inspiration/**", "src/compare/**", "src/grid/**", "src/edit/**"], rules: { "@next/next/no-img-element": "off" } },
  { ignores: ["mockups/**", "spike/out/**", "spike/browser/dist/**", ".next/**", "public/**"] },
];

export default config;

// Batas modul PRD bagian 4. Aturan ini gagal bila ada import ke file internal modul lain
// atau dependensi yang melawan arah rantai.
import tsParser from "@typescript-eslint/parser";
import boundaries from "eslint-plugin-boundaries";

const allowed = {
  audit: [],
  settings: [],
  notifications: ["settings"],
  staff: ["auth"],
  participants: ["auth", "notifications"],
  auth: ["staff", "participants", "notifications"],
  events: ["auth", "staff"],
  documents: ["events"],
  registrations: ["auth", "documents", "events", "participants"],
  review: ["auth", "audit", "documents", "events", "participants", "registrations"],
  reports: ["auth", "audit"],
};

export default [
  {
    files: ["apps/api/src/**/*.ts"],
    ignores: ["apps/api/src/scripts/**"],
    languageOptions: { parser: tsParser, parserOptions: { sourceType: "module" } },
    plugins: { boundaries },
    settings: {
      "import/resolver": { node: { extensions: [".ts"] } },
      "boundaries/include": ["apps/api/src/**/*.ts"],
      "boundaries/elements": [
        { type: "table", pattern: "apps/api/src/modules/*/*.table.ts", mode: "file", capture: ["name"] },
        { type: "module", pattern: "apps/api/src/modules/*", capture: ["name"] },
        { type: "shared", pattern: "apps/api/src/shared/**", mode: "file" },
        { type: "root", pattern: "apps/api/src/*.ts", mode: "file" },
      ],
    },
    rules: {
      "boundaries/no-unknown": "off",
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          message: "Dependensi ${file.type} ${file.name} ke ${dependency.type} ${dependency.name} melawan rantai modul (PRD aturan 3)",
          rules: [
            { from: "shared", allow: ["shared"] },
            { from: "root", allow: ["root", "shared", "module"] },
            // Tabel boleh saling mereferensikan untuk foreign key.
            { from: "table", allow: ["table"] },
            ...Object.entries(allowed).map(([name, deps]) => ({
              from: [["module", { name }]],
              allow: ["shared", ["module", { name }], ["table", { name }], ...deps.map((d) => ["module", { name: d }])],
            })),
            // Hanya reports yang boleh membaca lintas tabel (PRD aturan 8).
            { from: [["module", { name: "reports" }]], allow: ["table"] },
          ],
        },
      ],
      "boundaries/entry-point": [
        "error",
        {
          default: "disallow",
          message: "Modul lain hanya boleh dipakai lewat index.ts (PRD aturan 2)",
          rules: [
            { target: ["module"], allow: "index.ts" },
            { target: ["table"], allow: "*.table.ts" },
            { target: ["shared"], allow: "**" },
            { target: ["root"], allow: "**" },
          ],
        },
      ],
    },
  },
  // app.ts adalah titik perakitan: route dan listener tiap modul didaftarkan di sini.
  { files: ["apps/api/src/app.ts"], rules: { "boundaries/entry-point": "off" } },
];

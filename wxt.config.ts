import { defineConfig } from "wxt";

const GECKO_ID = "better-grammalecte@pllx76.dev";

export default defineConfig({
  srcDir: "src",
  imports: false,
  modules: ["@wxt-dev/module-react"],
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: "Better Grammalecte",
    short_name: "Better Grammalecte",
    description: "In-place French spelling and grammar checking, powered by the Grammalecte engine.",
    version_name: undefined,
    permissions: ["storage", "activeTab"],
    host_permissions: ["<all_urls>"],
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: GECKO_ID,
              strict_min_version: "128.0",
              data_collection_permissions: {
                required: ["none"],
              },
            },
          },
        }
      : {}),
  }),
});

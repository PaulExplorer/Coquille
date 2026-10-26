import { defineConfig } from "wxt";

// Add-on identifier (figé à vie sur AMO). Unique, stable, and anchored to
// the project's GitHub namespace: github.com/PaulExplorer/Coquille
const GECKO_ID = "coquille@paulexplorer";

export default defineConfig({
  srcDir: "src",
  imports: false,
  modules: ["@wxt-dev/module-react"],
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: "Coquille",
    short_name: "Coquille",
    description: "Correcteur d'orthographe et de grammaire en place, propulsé par le moteur Grammalecte.",
    version_name: undefined,
    permissions: ["storage"],
    host_permissions: ["<all_urls>"],
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      96: "icons/icon-96.png",
      128: "icons/icon-128.png",
    },
    action: {
      default_icon: {
        16: "icons/icon-16.png",
        32: "icons/icon-32.png",
        48: "icons/icon-48.png",
        96: "icons/icon-96.png",
        128: "icons/icon-128.png",
      },
      default_title: "Coquille",
    },
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

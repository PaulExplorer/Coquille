import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  imports: false,
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Better Grammalecte",
    short_name: "Better Grammalecte",
    description: "In-place French spelling and grammar checking, powered by the Grammalecte engine.",
    permissions: ["storage"],
  },
});

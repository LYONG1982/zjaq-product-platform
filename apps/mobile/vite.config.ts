import { defineConfig } from "vite";
import uniModule from "@dcloudio/vite-plugin-uni";
// DCloud's compiler is CommonJS; Vite's ESM config may wrap its default export.
const uni: typeof uniModule =
  typeof uniModule === "function"
    ? uniModule
    : (uniModule as unknown as { default: typeof uniModule }).default;
export default defineConfig({
  plugins: [
    uni(),
    {
      name: "workspace-h5-chunk-names",
      enforce: "post",
      config() {
        // Uni-App derives names from paths outside src, which can start with '..'.
        // Apply after its config hook so emitted imports stay valid relative ESM.
        if (process.env.UNI_PLATFORM === "h5")
          return {
            build: {
              rollupOptions: {
                output: { chunkFileNames: "assets/chunk-[hash].js" },
              },
            },
          };
      },
    },
  ],
  server: { host: "127.0.0.1", port: 3202, strictPort: true },
});

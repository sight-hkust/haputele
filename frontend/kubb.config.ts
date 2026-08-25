import { pluginFetch } from "@kubb/plugin-fetch";
import { pluginReactQuery } from "@kubb/plugin-react-query";
import { pluginTs } from "@kubb/plugin-ts";
import { defineConfig } from "kubb/config";

export default defineConfig({
  root: ".",
  input: "./openapi.json",
  output: {
    path: "./src/gen",
    clean: true,
    barrel: { type: "named" },
  },
  plugins: [
    pluginTs({
      output: {
        path: "types",
        mode: "directory",
        barrel: { type: "named" },
      },
      enum: { type: "asConst" },
      optionalType: "questionTokenAndUndefined",
    }),
    pluginFetch({
      output: {
        path: "clients",
        mode: "directory",
        barrel: { type: "named" },
      },
    }),
    pluginReactQuery({
      output: {
        path: "query",
        mode: "directory",
        barrel: { type: "named" },
      },
      client: "fetch",
      hooks: false,
    }),
  ],
});

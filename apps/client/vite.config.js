import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteTsconfigPaths from 'vite-tsconfig-paths'

// https://vite.dev/config/

export default defineConfig({
  base: "./",
  plugins: [react(), viteTsconfigPaths()],
  resolve: {
    // packages/ui has its own react for typechecking, this makes it use the client's at runtime
    dedupe: ["react", "react-dom"],
  },
})

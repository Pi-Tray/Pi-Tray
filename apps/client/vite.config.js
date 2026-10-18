import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteTsconfigPaths from 'vite-tsconfig-paths'

import {app_version} from '../../scripts/app-version.mjs'

// https://vite.dev/config/

export default defineConfig({
  base: "./",
  // the version this client was built as, so it can tell the server which one it's running
  define: {
    __PI_TRAY_VERSION__: JSON.stringify(app_version()),
  },
  plugins: [react(), viteTsconfigPaths()],
  resolve: {
    // packages/ui has its own react for typechecking, this makes it use the client's at runtime
    dedupe: ["react", "react-dom"],
  },
})

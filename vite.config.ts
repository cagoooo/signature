import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin, ResolvedConfig } from 'vite';

function createBuildVersion() {
  const builtAt = new Date();
  const timestamp = builtAt.toISOString().replace(/\D/g, '').slice(0, 14);
  let gitSha = 'local';

  try {
    gitSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() || gitSha;
  } catch {
    // 沒有 Git 的環境仍可用時間戳產生唯一版本。
  }

  return {
    version: `${timestamp}-${gitSha}`,
    builtAt: builtAt.toISOString(),
  };
}

function buildVersionPlugin(buildInfo: ReturnType<typeof createBuildVersion>): Plugin {
  let resolvedConfig: ResolvedConfig;

  return {
    name: 'signature-build-version',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config;
    },
    writeBundle() {
      const outputDirectory = resolve(resolvedConfig.root, resolvedConfig.build.outDir);
      const serviceWorkerPath = resolve(outputDirectory, 'sw.js');
      if (!existsSync(serviceWorkerPath)) {
        throw new Error(`找不到建置後的 Service Worker：${serviceWorkerPath}`);
      }

      const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');
      const replacedServiceWorker = serviceWorker.replace(
        'const BUILD_VERSION = "__BUILD_VERSION__";',
        `const BUILD_VERSION = "${buildInfo.version}";`,
      );
      if (replacedServiceWorker === serviceWorker) {
        throw new Error('Service Worker BUILD_VERSION sentinel 未被替換');
      }

      writeFileSync(serviceWorkerPath, replacedServiceWorker, 'utf8');
      writeFileSync(
        resolve(outputDirectory, 'version.json'),
        `${JSON.stringify({ ...buildInfo, notes: '網站版本自動更新' }, null, 2)}\n`,
        'utf8',
      );
      // GitHub Pages 不會替 BrowserRouter 做 history fallback；複製已完成資產
      // 的 index.html，讓直接開啟 /signature/admin/login 時仍能由 React Router 接手。
      writeFileSync(
        resolve(outputDirectory, '404.html'),
        readFileSync(resolve(outputDirectory, 'index.html'), 'utf8'),
        'utf8',
      );
      console.log(`✓ 版本已注入：${buildInfo.version}`);
    },
  };
}

const buildInfo = createBuildVersion();

// https://vite.dev/config/
export default defineConfig({
  define: {
    __SIGNATURE_BUILD_VERSION__: JSON.stringify(buildInfo.version),
  },
  plugins: [react(), buildVersionPlugin(buildInfo)],
  base: '/signature/',
})

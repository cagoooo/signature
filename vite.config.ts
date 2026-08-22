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

function buildVersionPlugin(): Plugin {
  let resolvedConfig: ResolvedConfig;
  let buildInfo = createBuildVersion();

  return {
    name: 'signature-build-version',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config;
      buildInfo = createBuildVersion();
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
      console.log(`✓ 版本已注入：${buildInfo.version}`);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), buildVersionPlugin()],
  base: '/signature/',
})

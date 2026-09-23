import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';
import fs from 'fs';
import path from 'path';

const prod = process.argv[2] === 'production';

// Pick up VAULT_PATH from .env (see .env.example) so builds land in the vault.
if (fs.existsSync('.env')) process.loadEnvFile('.env');

const copyToVault = {
  name: 'copy-to-vault',
  setup(build) {
    build.onEnd(() => {
      const vault = process.env.VAULT_PATH;
      if (!vault) return;
      const dest = path.join(vault, '.obsidian', 'plugins', 'task-tracker');
      fs.mkdirSync(dest, { recursive: true });
      for (const f of ['main.js', 'manifest.json', 'styles.css']) {
        if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dest, f));
      }
      console.log(`copied plugin to ${dest}`);
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', ...builtins],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  plugins: [copyToVault],
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}

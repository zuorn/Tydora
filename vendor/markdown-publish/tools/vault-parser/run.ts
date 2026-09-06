import { parseVault } from './parse-vault';

const argv = process.argv;
const env = process.env;

parseVault({
  vaultDir: argv[2] ?? env['VAULT'] ?? 'tools/fixtures/vault',
  outDir: argv[3] ?? env['CONTENT_OUT'] ?? 'src/content',
  mode: (argv[4] ?? env['BUILD_MODE'] ?? 'full') as 'public' | 'full',
  siteUrl: env['SITE_URL'],
  siteName: env['SITE_NAME'],
  siteDescription: env['SITE_DESCRIPTION'],
  siteLang: env['SITE_LANG'],
  siteFooter: env['SITE_FOOTER'],
  homeNote: env['HOME_NOTE'],
}).then(
  () => {
    console.log('vault-parser done');
  },
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'perf',
        'refactor',
        'docs',
        'style',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'scope-enum': [
      1, // warn 而不是 error，避免新的 scope 被误拒
      'always',
      [
        'web',
        'worker',
        'admin',
        'notify',
        'api',
        'db',
        'core',
        'providers',
        'ui',
        'infra',
        'docs',
        'deps',
      ],
    ],
    // 中文 / 长 subject 容忍：放宽到 100 字符
    'subject-case': [0],
    'subject-max-length': [2, 'always', 100],
    'header-max-length': [2, 'always', 120],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};

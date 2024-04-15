import type { Config } from 'jest';

const unitTest: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
};

const e2eTest: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'test',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
};

const config: Config = {
  projects: [unitTest, e2eTest],
};

export default config;
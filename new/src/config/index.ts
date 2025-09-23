export interface Config {
  targets: Record<string, Target>;
}

export interface Target {
  viewport: string;
}

export function defineConfig(config: Config): Config {
  return config;
}

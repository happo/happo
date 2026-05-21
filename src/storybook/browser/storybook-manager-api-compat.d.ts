// 'storybook/internal/manager-api' existed in Storybook v8 and v9 but was
// removed in v10. This ambient declaration lets addon-v8.ts compile against
// the v10 dev install; at runtime the import resolves from the user's v8
// Storybook install where the path actually exists.
declare module 'storybook/internal/manager-api' {
  export * from 'storybook/manager-api';
}

# Happo

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An open source library for integrating with [happo.io](https://happo.io) - a visual regression testing platform that helps you catch unintended visual changes in your applications.

## ⚠️ Active Development

This library is currently under active development. Features and APIs may change between releases. Follow this repository to get notified about new releases and updates.

## 📚 Documentation

For comprehensive documentation, visit [docs.happo.io](https://docs.happo.io).

## 🚀 Features

- **CLI Tool**: Includes a command-line interface for easy integration
- **Flexible Configuration**: Support for multiple configuration file formats
- **TypeScript Support**: Built with TypeScript and provides full type definitions
- **ES Modules**: Uses modern ES modules for better tree-shaking and performance
- **Cross-Platform**: Works on all major operating systems

## 📦 Installation

```bash
npm install happo --save-dev
# or
pnpm add happo --save-dev
# or
yarn add happo --dev
```

## 🛠️ Usage

### Basic Configuration

Create a `happo.config.ts` file in your project root:

```typescript
import { defineConfig } from 'happo';

export default defineConfig({
  apiKey: process.env.HAPPO_API_KEY!,
  apiSecret: process.env.HAPPO_API_SECRET!,
  targets: {
    'chrome-desktop': {
      browserType: 'chrome',
      viewport: '1280x720',
    },
    'firefox-desktop': {
      browserType: 'firefox',
      viewport: '1280x720',
    },
    'ios-safari': {
      browserType: 'ios-safari',
    },
  },
});
```

### CLI Usage

Run Happo using the CLI:

```bash
npx happo
```

The CLI will automatically find your configuration file and execute the visual regression tests.

## 🔧 Configuration Options

### Supported Configuration Files

The library automatically detects configuration files in the following order:

- `happo.config.js`
- `happo.config.mjs`
- `happo.config.cjs`
- `happo.config.ts`
- `happo.config.mts`
- `happo.config.cts`

### Key Configuration Properties

- **`apiKey`** & **`apiSecret`**: Authentication credentials for happo.io
- **`targets`**: Browser configurations for testing
- **`project`**: Optional project name for multi-project accounts

### Browser Targets

Supported browser types:

- **Desktop**: `chrome`, `firefox`, `edge`, `safari`, `accessibility`
- **Mobile**: `ios-safari`, `ipad-safari`

Each target supports advanced options like:

- Viewport sizing
- Maximum height/width
- Color scheme preferences

## 🧪 Testing

This project uses Node.js built-in test runner:

```bash
npm test
```

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Run tests: `pnpm test`
4. Build the project: `pnpm build`

### Code Style

- Uses ESLint for code linting
- Prettier for code formatting
- TypeScript for type safety

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Documentation](https://docs.happo.io)
- [happo.io](https://happo.io)
- [npm package](https://www.npmjs.com/package/happo)

## 💡 Support

For support and questions:

- Check the [documentation](https://docs.happo.io)
- Open an issue in this GitHub repository
- Contact happo.io support at support@happo.io

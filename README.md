# Lucid - Ethereum Transaction Interceptor

A Chrome extension that intercepts and logs Ethereum transaction requests for enhanced security and visibility.

## Features

- Monitors Ethereum provider objects (window.ethereum, window.rabby)
- Intercepts and logs transaction signing requests
- Works with MetaMask, Rabby, and other Ethereum wallets
- Helps identify potentially malicious transaction requests

## Development

This extension is built with TypeScript and Bun.

### Prerequisites

- [Bun](https://bun.sh/) (for building)
- Chrome/Chromium browser

### Setup

```bash
# Install dependencies
bun install

# Build the extension
bun run build
```

The built extension will be in the `dist` directory.

### Development

```bash
# Watch for changes and rebuild
bun run watch
```

### Installation in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `dist` directory
4. The extension should now be installed and active

## How It Works

The extension injects a script into web pages that monitors the Ethereum provider objects. When a transaction signing request is detected, it logs the details to the console, making it easier to identify potentially malicious requests.

## License

MIT

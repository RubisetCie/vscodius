# VSCodius

**This is a fork containing Microsoft's `vscode` software with manually expunged telemetry.**

Unlike the [VSCodium](https://github.com/VSCodium/vscodium) project, it does not use scripts to automatically build `vscode` into freely-licensed binaries with a community-driven default configuration.

This source code is available to everyone under the standard [MIT license](LICENSE.txt).

## Prerequistes

In order to build *VSCodius*, you'll need the necessary tools:

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/)
- [Yarn](https://classic.yarnpkg.com/)
- [Python](https://www.python.org/downloads/) (required for `node-gyp`)
- A C/C++ compiler tool chain for your platform:
  - **Windows**
    - Install the Visual C++ Build Environment by either installing the [Visual Studio Build Tools](https://visualstudio.microsoft.com/thank-you-downloading-visual-studio/?sku=BuildTools) or the [Visual Studio Community Edition](https://visualstudio.microsoft.com/thank-you-downloading-visual-studio/?sku=Community). The minimum workload to install is 'Desktop Development with C++'.
	- Open a command prompt and run `npm config set msvs_version [version]`.
	- If the Visual C++ Build Tools are installed in a non-default directory, set the following environment variable `set vs[version]_install=[path]`.
  - **Mac OS**
    - [XCode](https://developer.apple.com/xcode/downloads/) and the Command Line Tools, which will install `gcc` and the related toolchain containing `make`.
    - Run `xcode-select --install` to install the Command Line Tools.
  - **Linux**
    - *On Debian-based Linux*: `sudo apt-get install build-essential g++ libx11-dev libxkbfile-dev libsecret-1-dev python-is-python3`.
    - *On Red Hat-based Linux*: `sudo yum groupinstall "Development Tools" && sudo yum install libX11-devel.x86_64 libxkbfile-devel.x86_64 libsecret-devel # or .i686`.
    - *Others*:
      - `make`
      - `pkg-config`
      - `gcc` (or another compile toolchain)

## Build

Install and build all of the dependencies using `yarn`:

```
yarn
```

Then to build from a terminal:

```
yarn compile
```

The incremental builder will do an initial full build and will display a message that includes the phrase 'Finished compilation' once the initial build is complete.

## Run on desktop

Running on *Electron* with extensions run in *Node.js*:

```
./scripts/code.sh
./scripts/code-cli.sh # for running CLI commands (eg --version)
```

## Run in web browser

Where *extensions* and *UI* run in the browser:

```
./scripts/code-web.sh
```

## Run in web server

Where *UI* run in the browser but *extensions* run in code server (*Node.js*):

```
./scripts/code-server.sh --launch
```

## Packaging

VSCodius can be packaged for the following platforms: `win32-ia32 | win32-x64 | darwin-x64 | darwin-arm64 | linux-ia32 | linux-x64 | linux-arm`.

These `gulp` tasks are available:

- `vscode-[platform]`: Builds a packaged version for `[platform]`.
- `vscode-[platform]-min`: Builds a packaged and minified version for `[platform]`.

Run `gulp` via `yarn` to avoid potential out of memory issues, for example: `yarn gulp vscode-linux-x64`

## Code of Conduct

This project still remain under the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT](LICENSE.txt) license.

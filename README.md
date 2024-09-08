# VSCodius

**This is a fork containing Microsoft's `vscode` software with manually expunged telemetry, experimentation, surveys and update service.**

Unlike the [VSCodium](https://github.com/VSCodium/vscodium) project, it does not use scripts to automatically build `vscode` into freely-licensed binaries with a community-driven default configuration.

This source code is available to everyone under the standard [MIT license](LICENSE.txt).

## Prerequistes

In order to build *VSCodius*, you'll need the necessary tools:

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/)
- [Yarn](https://classic.yarnpkg.com/)
- [Python](https://www.python.org/downloads/) (required for `node-gyp`)
- [Cargo](https://www.rust-lang.org/tools/install) (optional: command-line tools)
- A C/C++ compiler tool chain for your platform:
  - **Windows**
    - Install the Visual C++ Build Environment by either installing the [Visual Studio Build Tools](https://visualstudio.microsoft.com/thank-you-downloading-visual-studio/?sku=BuildTools) or the [Visual Studio Community Edition](https://visualstudio.microsoft.com/thank-you-downloading-visual-studio/?sku=Community). The minimum workload to install is "Desktop Development with C++". But there are additional components from "Individual components":
      - `C++ x64/x86 Spectre-mitigated libs (Latest)` (use `ARM64` for Windows on ARM)
      - `C++ ATL for latest build tools with Spectre Mitigations`
      - `C++ MFC for latest build tools with Spectre Mitigations`
	- Open a command prompt and run `npm config set msvs_version [version]`.
	- If the Visual C++ Build Tools are installed in a non-default directory, set the following environment variable `set vs[version]_install=[path]`.
  - **Mac OS**
    - [XCode](https://developer.apple.com/xcode/downloads/) and the Command Line Tools, which will install `gcc` and the related toolchain containing `make`.
    - Run `xcode-select --install` to install the Command Line Tools.
  - **Linux**
    - *On Debian-based Linux*: `sudo apt-get install build-essential libx11-dev libxkbfile-dev libsecret-1-dev libkrb5-dev python-is-python3`.
    - *On Red Hat-based Linux*: `sudo yum groupinstall "Development Tools" && sudo yum install libX11-devel.x86_64 libxkbfile-devel.x86_64 libsecret-devel krb5-devel # or .i686`.
    - *Others*:
      - `make`
      - `pkg-config`
      - `gcc` (or another compile toolchain)
    - Building *deb* and *rpm* packages requires `fakeroot` and `rpm`; run: `sudo apt-get install fakeroot rpm`

## Build

Install and build all of the dependencies using `yarn`:

```
yarn
```

Then to build from a terminal:

```
yarn compile
```

The incremental builder will do an initial full build and will display a message that includes the phrase "Finished compilation" once the initial build is complete.

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

### VSCodius

*VSCodius* can be packaged for the following platforms: `win32-ia32 | win32-x64 | darwin-x64 | darwin-arm64 | linux-ia32 | linux-x64 | linux-arm`.

These `gulp` tasks are available:

- `vscode-[platform]`: Builds a packaged version for `[platform]`.
- `vscode-[platform]-min`: Builds a packaged and minified version for `[platform]`.

Run `gulp` via `yarn` to avoid potential out of memory issues, for example: `yarn gulp vscode-linux-x64`

### Command-line tools

The *command-line tools* can are optional, and can be built using `cargo`, from the "cli" directory:

```
cargo build --release
```

### Distro packages

To package for Linux, after having build both the (main package)[#vscodius] and the (CLI tools)[#command-line-tools], run the following tasks:

```
# Debian...
yarn gulp vscode-linux-x64-prepare-deb
yarn gulp vscode-linux-x64-build-deb

# Red Hat...
yarn gulp vscode-linux-x64-prepare-rpm
yarn gulp vscode-linux-x64-build-rpm

# Snap...
yarn gulp vscode-linux-x64-prepare-snap
yarn gulp vscode-linux-x64-build-snap
```

This will output files in the ".build" sub-directory.

Note on Windows: sometimes the default `ElectronJS` resources will remain on the packaged executable. In order to fix this, run the following command:

```
node build\win32-resources-patch.js [exe path]
```

## Code of Conduct

This project still remain under the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT](LICENSE.txt) license.

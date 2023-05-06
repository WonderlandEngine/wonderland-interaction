![wonderland-engine-logo](screenshots/wle-logo-horizontal-reversed.png)

# WE-IL: Wonderland Engine Interaction Library

## Features

* Generic interactor / interactable
* Single-hand grabbing
* Double-hand grabbing (coming soon)
* Event system (coming soon)
* Throwing (coming soon)

## Install

The library is in development mode and not already available on `npm`. However, you
can already use it locally either with [npm link](https://docs.npmjs.com/cli/v8/commands/npm-link), or using a local installation:

First, install and build the library:

```sh
cd path/to/weil
npm i
npm run build
```

Then, link it to your project:

```sh
cd path/to/my/project
npm i path/to/weil
```

## Examples

1. Download the repository
2. Run `npm install` at the root
3. Open any examples under `examples/*`

#### Playground

* Single-hand grabbing
* Double-hand grabbing

## ToDo List

* [ ] Disable distance grabbing when a double-hand grabbable is only grabbed with one hand
* [ ] Emulate angular velocity
* [ ] Improve throwing speed uniformity between emulated and native

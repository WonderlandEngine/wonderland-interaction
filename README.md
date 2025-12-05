<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/WonderlandEngine/api/blob/master/img/wle-logo-horizontal-reversed-dark.png?raw=true">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/WonderlandEngine/api/blob/master/img/wle-logo-horizontal-reversed-light.png?raw=true">
  <img alt="Wonderland Engine Logo">
</picture>

# Wonderland Engine Interaction Library

> 🚧 This library is currently published as a release candidate. It's a work-in-progress and the
> API might change slightly before reaching the first version. 🚧

## Features

* Generic interactor / interactable
* Single-hand grabbing
* Double-hand grabbing
* Event system
* Throwing
* Constraints

For more information, have a look at the [documentation](./DOC.md).

## Install

The library is in development mode and not already available on `npm`. However, you can already use it locally either with [npm link](https://docs.npmjs.com/cli/v8/commands/npm-link), or using a local installation:

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

1. Clone the repository
2. Open any examples under `examples/*`

![Wonderland Engine interaction example](img/example.png)

## Usage

Refer to the [documentation](./DOC.md) for a deep dive.

# Execr
## Simple node process management tool for short-lived processes

**Execr** is intended to simplify the `child_process` `spawn` commands for use in the 99% of cases, where you don't want to worry about the specifics of managing the process.
> Execr is not intended to manage long-running processes.

## Install
```
$ yarn add @markjm/execr
```

## Usage
```js
const { exec, execAsync, wrap } = require('@markjm/execr');

// Sync version to quickly grab
const branch = exec("git", ["branch"]).stdout;


// Async version
execAsync("yarn", ["workspaces", "info"]).then({ stdout } => console.log(stdout));

// Wrap a command for simple access to very nested sub-commands.
const az = wrap("az");
az.artifacts.universal.download(["--file", "my-file"]);
// Actually, this will take a while, lets make it async...
const az = wrapAsync("az");
az.artifacts.universal.download(["--file", "my-file"]).then({ status } => console.log(status));

// If a failure is expected...
const errMsg = exec("git", ["push"], { failOnError: false }).stderr;
// Memoize expensive calls...
const files = exec("git", ["ls-files"], { memoize: true }).stdout.split("\n");
```

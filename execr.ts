import spawn from "cross-spawn";
import { memoize } from "lodash";
import { SpawnOptions, ChildProcess } from "child_process";

type AnyKey<T> = T & {
  [key: string]: T
};

type AsyncifiedObject<T> = {
	[P in keyof T]: Promise<T[P]>
}
type AnyFunction = (...args: any) => any;
type Tail<T extends any[]> =
  ((...args: T) => void) extends ((firstArg: any, ...restOfArgs: infer R) => void) ? R : never;
type CurriedFunction<T extends AnyFunction> = (...args: Tail<Parameters<T>>) => ReturnType<T>;

type ExecOpts = {
  failOnError?: boolean,
  memoize?: boolean
} & SpawnOptions;
type MaybeArgs = string[] | ExecOpts | undefined;

type ExecParameters = [string, MaybeArgs?, (ExecOpts | undefined)?];

type ExecResult = {
  status: -1 | number | NodeJS.Signals,
  stdout: string,
  stderr: string,
}

type AttachedPromise<T> = Promise<T> & AsyncifiedObject<T> & { _child: ChildProcess }
type ExecFunction = (...args: ExecParameters) => ExecResult;
type ExecAsyncFunction = (...args: ExecParameters) => AttachedPromise<ExecResult>;

const memoizeSpawnSync = memoize(spawn.sync, (...args) => JSON.stringify(args));
const isObject = (maybeObj: unknown) => Object.prototype.toString.call(maybeObj) == "[object Object]";

const normalizeArgs = (maybeArgs: MaybeArgs, suppliedOptions?: ExecOpts, defaultOptions?: ExecOpts) => {
  const globalDefaultOpts = {
    maxBuffer: 1024 * 1024 * 10,
    failOnError: true,
    memoize: false
  }

  const normalizedDefaultOpts = defaultOptions || {};

  let finalOpts = isObject(maybeArgs) ? maybeArgs as ExecOpts : suppliedOptions || {};
  finalOpts = { ...globalDefaultOpts, ...normalizedDefaultOpts, ...finalOpts }

  const finalArgs = Array.isArray(maybeArgs) ? maybeArgs.filter(Boolean) : [];

  return [finalArgs, finalOpts] as [string[], ExecOpts];
}

function execAsync(
  cmd: string,
  maybeArgs: MaybeArgs,
  opts?: ExecOpts
): AttachedPromise<ExecResult> {
  const [endArgs, execOpts] = normalizeArgs(maybeArgs, opts);

  let stdout = "";
  let stderr = "";
  const childProcess = spawn(cmd, endArgs, execOpts);
  const promise = new Promise(function (resolve, reject) {
    childProcess.stdout?.on("data", data => (stdout += data));
    childProcess.stderr?.on("data", data => (stderr += data));

    childProcess.on("error", err => {
      const errorMessage = `${cmd} ${endArgs.join(" ")} errored.\n${err}`.trim();
      if (execOpts.failOnError) {
        reject(errorMessage);
      }

      resolve({
        status: -1,
        stdout: "",
        stderr: `${err}`.trim()
      });
    });

    return childProcess.on("close", (status, signal) => {
      if (status > 0 || signal) {
        const errorMessage = `${cmd} ${endArgs.join(" ")} failed. Status ${status}, Signal ${signal}.\n${stderr}`;
        if (execOpts.failOnError) {
          reject(errorMessage);
        }
      }

      resolve({
        status: (status || signal)!,
        stdout: `${stdout}`.trim(),
        stderr: `${stderr}`.trim()
      });
    });
  }) as AttachedPromise<ExecResult>;

  promise._child = childProcess;
  promise.status = promise.then(result => result.status);
  promise.stdout = promise.then(result => result.stdout);
  promise.stderr = promise.then(result => result.stderr);
  return promise;
}

function exec(
  cmd: string,
  maybeArgs: MaybeArgs,
  opts?: ExecOpts
): ExecResult {
  const [endArgs, execOpts] = normalizeArgs(maybeArgs, opts);

  const spawnFunc = execOpts.memoize ? memoizeSpawnSync : spawn.sync;
  const result = spawnFunc(cmd, endArgs, execOpts);

  if ((result.status && result.status > 0) || result.signal) {
    const errorMessage = `${cmd} ${endArgs.join(" ")} failed. Status ${
      result.status
      }, Signal ${result.signal}.\n${result.stderr}`;
    if (execOpts.failOnError) {
      throw new Error(errorMessage);
    }
  }

  return {
    status: (result.status || result.signal)!,
    stdout: `${result.stdout}`.trim(),
    stderr: `${result.stderr}`.trim()
  };
}

/**
 * Creates a partial function with the initial command argument embedded.
 * Example: `let yarn = wrap("yarn")` allows you to make yarn calls like
 * `yarn(["list"])`.
 * 
 * For ease of use, this also allows for chaining of commands, which can be valuable
 * in cases where there are a lot of subcommands.
 * Example `az.artifacts.universal.download(["--file", "<name>"])`
 * 
 * @param command - string of command which will be passed as first argument to exec.
 * @param defaultOptions - Default options to be used for all invocations of this wrapped command.
 * Examples: `git`, `yarn`, `az`.
 */
function _wrap<T extends AnyFunction>(fn: T, cmd: string, defaultOpts?: ExecOpts): AnyKey<AnyKey<AnyKey<AnyKey<AnyKey<AnyKey<AnyKey<CurriedFunction<T>>>>>>>>;
function _wrap<T extends AnyFunction>(fn: T, cmd: string, defaultOpts?: ExecOpts): CurriedFunction<T> {
  let args: string[] | undefined = [];

  function _fn(...[endArgsOrOpts, suppliedOpts]: Parameters<CurriedFunction<T>>): ReturnType<CurriedFunction<T>> {
    if (!args) {
      args = [];
    }

    const [endArgs, execOpts] = normalizeArgs(endArgsOrOpts, suppliedOpts, defaultOpts);

    try {
      return fn(cmd, args.concat(endArgs), execOpts);
    } finally {
      args = undefined;
    }
  }

  const handler: ProxyHandler<(typeof _fn & { args: string[] })> = {
    get: function (proxiedObj, prop, proxy) {
      if ((proxiedObj as any)[prop] || typeof prop == "symbol") {
        return (proxiedObj as any)[prop];
      }
      if (!args) {
        args = [];
      }

      args.push(prop.toString());
      return proxy;
    }
  };
  return new Proxy(_fn, handler);
}

const wrap = (cmd: string, defaultOptions?: ExecOpts) => _wrap<ExecFunction>(exec, cmd, defaultOptions);
const wrapAsync = (cmd: string, defaultOptions?: ExecOpts) => _wrap<ExecAsyncFunction>(execAsync, cmd, defaultOptions);

export {
  exec,
  execAsync,
  wrap,
  wrapAsync
}
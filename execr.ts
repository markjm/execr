import spawn from "cross-spawn";
import { memoize } from "lodash";
import { SpawnOptions } from "child_process";

type AnyKey<T> = T & {
  [key: string]: T
}

type Tail<T extends any[]> = 
  ((...args: T)=>void) extends ((firstArg: any, ...restOfArgs: infer R)=>void) ? R : never;

type TailParameters<T extends (...args: any) => any> = Tail<Parameters<T>>

// There must be a better way...
type FunctionWithArbitraryParameters<T extends (this: AnyKey<T>, ...args: any) => any> = 
  T & 
  AnyKey<T> & 
  AnyKey<AnyKey<T>> &
  AnyKey<AnyKey<AnyKey<T>>> & 
  AnyKey<AnyKey<AnyKey<AnyKey<T>>>> & 
  AnyKey<AnyKey<AnyKey<AnyKey<AnyKey<T>>>>> & 
  AnyKey<AnyKey<AnyKey<AnyKey<AnyKey<AnyKey<T>>>>>> &
  AnyKey<AnyKey<AnyKey<AnyKey<AnyKey<AnyKey<AnyKey<T>>>>>>> &
  AnyKey<AnyKey<AnyKey<AnyKey<AnyKey<AnyKey<AnyKey<AnyKey<T>>>>>>>>;

type ExecSyncOpts = {
  failOnError?: boolean,
  memoize?: boolean,
} & SpawnOptions

type ExecResult = {
  status: number | NodeJS.Signals,
  stdout: string,
  stderr: string,
}

type MaybeArgs = string[] | ExecSyncOpts | undefined;

const memoizeSpawnSync = memoize(spawn.sync, (...args) => JSON.stringify(args));
const isObject = (maybeObj: unknown) => Object.prototype.toString.call(maybeObj) == "[object Object]";

const normalizeArgs = (maybeArgs: MaybeArgs, options?: ExecSyncOpts) => {
  const defaultArgs = {
    maxBuffer: 1024 * 1024 * 10,
    failOnError: true,
    memoize: false
  }

  let finalOpts = isObject(maybeArgs) ? maybeArgs as ExecSyncOpts : options || {};
  finalOpts = { ...defaultArgs, ...finalOpts }

  const rawArgs = Array.isArray(maybeArgs) ? maybeArgs.filter(Boolean) : [];
  const finalArgs = ([] as string[]).concat(...rawArgs.map(s => s.split(/\s/))).filter(Boolean);

  return [finalArgs, finalOpts] as [string[], ExecSyncOpts];
}

async function execAsync(
  cmd: string,
  args: string[],
  opts = {
    failOnError: true
  }
): Promise<ExecResult> {
  let stdout = "";
  let stderr = "";

  return new Promise(function(resolve, reject) {
    const childProcess = spawn(cmd, args.filter(Boolean));

    childProcess.stdout?.on("data", data => (stdout += data));
    childProcess.stderr?.on("data", data => (stderr += data));

    childProcess.on("error", err => {
      const errorMessage = `${cmd} ${args.join(" ")} errored.\n${err}`.trim();
      if (opts.failOnError) {
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
        const errorMessage = `${cmd} ${args.join(" ")} failed.\n${stderr}`;
        if (opts.failOnError) {
          reject(errorMessage);
        }
      }

      resolve({
        status,
        stdout: `${stdout}`.trim(),
        stderr: `${stderr}`.trim()
      });
    });
  });
}

function exec(
  cmd: string,
  maybeArgs: MaybeArgs,
  opts: ExecSyncOpts
): ExecResult {
  const [ endArgs, execOpts ] = normalizeArgs(maybeArgs, opts);

  const spawnFunc = opts.memoize ? memoizeSpawnSync : spawn.sync;
  const result = spawnFunc(cmd, endArgs, execOpts);

  if ((result.status && result.status > 0) || result.signal) {
    const errorMessage = `${cmd} ${endArgs.join(" ")} failed. Status ${
      result.status
    }, Signal ${result.signal}.\n${result.stderr}`;
    if (opts.failOnError) {
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
 * Example `az.artifacts.universal.download(["--file", "<name>"])
 * 
 * @param command - string of command which will be passed as first argument to exec.
 * Examples: `git`, `yarn`, `az`.
 */
function wrap(fn: string) {
  let args: string[] | undefined = [];

  function _fn(endArgsOrOpts: MaybeArgs = [], opts: ExecSyncOpts = {}): ExecResult {
    if (!args) {
      args = [];
    }

    const [ endArgs, execOpts ] = normalizeArgs(endArgsOrOpts, opts);

    try {
      return exec(fn, args.concat(endArgs), execOpts);
    } finally {
      args = undefined;
    }
  }

  const handler: ProxyHandler<(typeof _fn & { args: string[] })> = {
    get: function(proxiedObj, prop, proxy) {
      if ((proxiedObj as any)[prop] || typeof prop == "symbol") {
        return (proxiedObj as any)[prop];
      }
      if (!args) {
        args = [];
      }
    
      const splitArgs = prop.toString().split(/\s/).filter(Boolean);
      args.push(...splitArgs);
      return proxy;
    }
  };
  const proxy = new Proxy(_fn, handler);
  return proxy as FunctionWithArbitraryParameters<typeof proxy>;
}

export {
  exec,
  execAsync,
  wrap
}

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
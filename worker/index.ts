import { DurableObject } from "cloudflare:workers";

export interface Env {
  HARMONIES: DurableObjectNamespace<Harmonies>;
}

// Worker
export default {
  async fetch(request, env) {
    // A stub is a client used to invoke methods on the Durable Object
    console.log(env);
    const stub = env.HARMONIES.getByName("foo");

    // Methods on the Durable Object are invoked via the stub
    const rpcResponse = await stub.sayHello();

    return new Response(rpcResponse);
  },
} satisfies ExportedHandler<Env>;

// Durable Object
export class Harmonies extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async sayHello(): Promise<string> {
    return "Hello, World!";
  }
}

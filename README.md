<div style="display: flex; flex-direction: column; align-items: center; max-width: 830px; margin: 0 auto;">
<h1 align="center" style="font-size: 1.8rem">Cobalt (+ Cobalt Auth 🔑)</h1>
<h2 align="center" style="font-size: 1.6rem; border-bottom: none;">
<strong>
  Use GraphQL in a tRPC style.
</br>
</br>
  tRPC's speed, GQL's flexibility.
</br>
</br>
  No headaches. No compromise.
</strong>
</h2>
<br />
<div align="center">

![Quick-Demo](https://github.com/user-attachments/assets/ae863b5c-7edf-4215-9607-c2f874d17b5b)

<div align="justify">
</br>

<h2>
  Demo
</h2>

https://github.com/user-attachments/assets/ba77834d-0cca-4930-ba3f-fb0dd831e101

<h2>
  Setup
</h2>

```bash
bunx @cobalt27/dev init
```

<h2>
  Quick Start
</h2>

<strong>Think 'like in tRPC, I just want an endpoint'.</strong></br>
You write your business logic in separate typescript files and the GraphQL schema is automatically generated.
</br>
</br>
The naming of Queries, Mutations and Subscriptions is derived from your folder structure and file naming.

<img width="894" height="574" alt="grafik" src="https://github.com/user-attachments/assets/42c9be6c-af79-44e9-b187-06bca11191ee" />

You can co-locate your utility and helper code and whatever you want in a nested directory as long</br>
as you export your Query / Mutation / Subscription from the `index.ts`in that directory.

**Queries** are defined with <code>export function Query(){ ... }</code></br>
**Mutations** are defined with <code>export function Mutation(){ ... }</code></br>
**Subscriptions** are defined with <code>export function\* Subscription(){ ... }</code>

**Typenames** can be set with <code>export const \_\_typename = "...";</code>

<summary><h3>Basic Example (click 'Details' to expand)</h3></summary><details>

<h4>1. Create the context factory in the `ctx.ts` file:</h4>

```bash
touch server/ctx.ts
```

```typescript
// The `ctx.ts` file must use a default export to export an async function
// as the GraphQL context factory.
export default async function ({ headers }: CobaltCtxInput) {
  const userid = headers.get("Authorization") ?? "anonymous";
  return {
    userid,
  };
}
```

<h4>2. Create an example query:</h4>

```bash
touch server/operations/profile.ts
```

```typescript
export function Query() {
  // Use $$ctx(this) helper function to get the GraphQL context value
  // this is fully typed and `$$ctx` is available in the global scope

  const { userid } = $$ctx(this);

  return {
    user: userid,
    profile: {
      image: "...",
    },
  };
}

// By exporting this you can customize the name of your return type
// for the GraphQL schema
export const __typename = "UserProfile";
```

<h4>3. Use the query in your client code with the generated Samarium SDK</h4>

```typescript
import sdk from "sdk";

// Using the magic $all selector, so we don't need to manually define the graphql selection
const profile = await sdk.query.profile((s) => s.$all({})).auth("some userid");

console.log(profile);
```

<h4>4. Run the development server</h4>

```bash
bunx cobalt dev
```

</details>

<h3>Example with Cobalt Auth (uses OpenAuthJS under the hood)</h3>

<h4>1. Create the context factory in the `ctx.ts` file:</h4>

```bash
touch server/ctx.ts
```

```typescript
// The `ctx.ts` file must use a default export to export an async function
// as the GraphQL context factory.
export default async function ({ headers }: CobaltCtxInput) {
  return {
    headers,
  };
}
```

<h4>2. Create an example query:</h4>

```bash
touch server/operations/profile.ts
```

```typescript
export function Query() {
  // Use $$auth(this) helper function to get the token of the authenticated user
  // this is fully typed and `$$auth` is available in the global scope

  const { token } = $$auth(this);
  // also `query` and `mutation` are available here, so you can use the Cobalt Auth SDK
  // this gives you access to all Identity Management Platform (IdMP) operations

  // The properties of the token are defined in the `auth.ts` file
  const { email } = token.subject.properties;

  return {
    user: email,
    profile: {
      image: "...",
    },
  };
}

// By exporting this you can customize the name of your return type
// for the GraphQL schema
export const __typename = "UserProfile";
```

<h4>3. Create the `auth.ts` file to configure Cobalt Auth:</h4>

```bash
touch server/auth.ts
```

```typescript
import auth from "@cobalt27/auth";
import { string } from "valibot";
import { CodeUI } from "@openauthjs/openauth/ui/code";
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";
import { CodeProvider } from "@openauthjs/openauth/provider/code";

export default {
  clientId: "client_id",
  issuer: {
    cobalt: auth({
      models: {
        user: {
          id: "String @id @default(ulid())",
        },
      },
      tokens: {
        user: {
          id: string(),
          email: string(),
        },
      },
      providers: {
        code: CodeProvider<{ email: string }>(
          CodeUI({
            mode: "email",
            sendCode: async (email, code) => {
              console.log(email, code);
            },
          }),
        ),
      },
      openauth: (sdk) => ({
        storage: MemoryStorage({
            persist: "./persist.json",
        }),
        success: async (ctx, value) => {
          if (value.provider === "code") {
            const email = value.claims.email;

            const user = await sdk.mutation.adminAuthSignIn({
              user_id: email,
              claims: {
                email,
              },
              provider: "email",
            })(({ id }) => ({ id }));

            if (!user?.id) {
              throw new Error("User not found");
            }

            return ctx.subject("user", { id: user.id, email });
          }

          throw new Error("Invalid provider");
        },
      }),
    }),
  },
};
```

<h4>4. Use OpenAuthJS in your frontend (Cobalt exposes the OpenAuthJS Issuer Server)</h4>

You can use the `createClient` function from OpenAuthJS to create a client for your frontend.

See the [OpenAuthJS documentation](https://github.com/sst/openauth?tab=readme-ov-file#auth-client) for more information.

Cobalt Auth also includes helper functions to integrate OpenAuthJS into your frontend.

Right now, we only support React Router 7.

```typescript
// root.tsx
import { redirect } from "react-router";
import sdk from "sdk";

import {
    makeAuthLoader,
    accessTokenFromCookie,
} from "@cobalt27/auth/react/rr7";

// initialize the sdk with the default cookie based auth
sdk.init({
    auth: accessTokenFromCookie,
});

// use the makeAuthLoader function to create a loader for your frontend
export const loader = makeAuthLoader(
  {
    clientID: "client_id", // name your client id here
    issuer: "http://localhost:4000", // url of cobalt auth
    // the default subject schema is:
    // the id is required, but you can add other fields here
    // however, it has to match the configuration on the server side in the cobalt auth config
    // see the auth.ts file in the cobalt server directory
    // subjects: {
    //   user: {
    //     id: string(),
    //   },
    // },

    // you can specify paths that should be ignored by the auth loader
    unprotectedPaths: ["/error", "/logout"],
  },
  (tokens) => {
    sdk.init({
      auth: tokens.tokens.access,
    });
  },
  (error) => {
    return redirect("/error" + "?error=" + error);
  },
);
// ... the rest of your root.tsx file ...
```

<h4>4. Run the development server</h4>

```bash
bunx cobalt dev
```

<h3>Build and start the production server</h3>

```bash
bunx cobalt build
bunx cobalt start
```

<h3>Build the production server for a Docker image</h3>

```bash
bunx cobalt build --docker
```

## License

This project, including all packages, is licensed under the Server Side Public License (SSPL).

See the [LICENSE](LICENSE) file for details.

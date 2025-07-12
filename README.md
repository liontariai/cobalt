<div style="display: flex; flex-direction: column; align-items: center; max-width: 830px; margin: 0 auto;">
<h1 align="center" style="font-size: 1.8rem"><strong>Cobalt</strong></h1>
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

<table style="width: 100%; border-collapse: collapse;">
  <tr>
    <td style="width: 40%; text-align: center; padding: 5px;">
      <img src="https://github.com/user-attachments/assets/5a1ae064-b0a1-492e-8592-2fb34c2f9783" alt="file-structure" width="350">
    </td>
    <td style="width: 20%; text-align: center; padding: 10px;">
        Results in the following Schema.</br>
        Assuming the files in <code>get/</code> use </br></br>
        <pre>export function Query(){ ... }</pre></br>
        and files in <code>upsert/</code> use </br></br>
        <pre>export function Mutation(){ ... }</pre></br></br>
        and typenames are set with</br>
        <code>export const __typename = "...";</code>
    </td>
    <td style="width: 40%; text-align: center; padding: 5px;">
      <img src="https://github.com/user-attachments/assets/fe3e79e7-0b85-47cd-aa78-39891cd99e30" alt="gql-schema" width="350">
    </td>
  </tr>
</table>

You can co-locate your utility and helper code and whatever you want in a nested directory as long</br>
as you export your Query / Mutation / Subscription from the `index.ts`in that directory.

<h3>Example</h3>

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
bun cobalt dev
```

## License

This project, including all packages, is licensed under the Server Side Public License (SSPL).

<br/>
See the [LICENSE](LICENSE) file for details.

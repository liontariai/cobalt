type SearchResult =
    | {
          title: string;
          description: string;
      }
    | {
          url: string;
      };

export function Query(): { value: SearchResult } {
    let res: SearchResult;
    res = {
        title: "Hello, World!",
        description: "This is a test",
    };
    return {
        value: res,
    };
}

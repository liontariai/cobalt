const _self = self as Record<string, any>;

_self["$$use"] = (fn: any) => {
    return fn;
};
_self["$$auth"] = function (that: any) {
    return new Proxy(that["$$ctx"]!["$$auth"], {
        get: (target, prop) => {
            return target[prop];
        },
    });
};
_self["$$ctx"] = function (that: any) {
    return new Proxy(that["$$ctx"], {
        get: (target, prop) => {
            return target[prop];
        },
    });
};
_self["$$root"] = new Proxy(
    {},
    {
        get: (target, prop) => {
            return (that: any) =>
                new Proxy(that["$$root"], {
                    get: (target, prop) => {
                        return target[prop];
                    },
                });
        },
    },
);
